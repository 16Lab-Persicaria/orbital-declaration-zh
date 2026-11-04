/* Orbital Declaration — guide: the planner and the navigator.
   Looks ahead with the real autopilot so the map can draw what a ship is about to do and the panel can say it
   in plain words: turn, burn, flip, brake, arrive. Nothing here changes the simulation. */
(function () {
  'use strict';
  const OD = window.OD;
  const U = OD.U, P = OD.P;
  const AP = OD.Autopilot;
  const fmt = U.fmt;
  // v15: a touch screen taps, and a phone has no ship list beside the map.
  const touch = () => { if (typeof window === 'undefined') return false; try { if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true; } catch (e) { /* no media queries */ } return window.innerWidth < 900; };
  const tap = () => '点击';
  const narrow = () => typeof window !== 'undefined' && window.innerWidth < 900;

  const HORIZON = 4 * 3600;   // s of look-ahead
  const MOVABLE = { intercept: 1, keeprange: 1, matchv: 1, retreat: 1, manual: 1, evade: 1, approach: 1 };

  // A cheap stand-in for a ship: enough state for the autopilot's desire function and for propellant accounting.
  function shipLike(ship) {
    return {
      id: ship.id, faction: ship.faction, role: ship.role,
      pos: { x: ship.pos.x, y: ship.pos.y }, vel: { x: ship.vel.x, y: ship.vel.y }, heading: ship.heading,
      dryMass: ship.dryMass, propMass: ship.propMass, thrust: ship.thrust, exhaustVelocity: ship.exhaustVelocity,
      angAccel: ship.angAccel, maxAngVel: ship.maxAngVel, systems: ship.systems, overheated: ship.overheated,
      disabled: ship.disabled, destroyed: ship.destroyed,
      mass() { return this.dryMass + this.propMass; },
      accel() {
        if (this.propMass <= 0 || this.disabled || this.destroyed) return 0;
        return (this.thrust * this.systems.drive * (this.overheated ? 0.25 : 1)) / this.mass();
      },
    };
  }

  // Is this thrust fighting the relative motion along the line to the target (braking) or adding to it (burning)?
  function classify(s, t, want, order) {
    if (!t || order.type === 'retreat' || order.type === 'manual') return 'burn';
    const rhat = U.norm(U.sub(t.pos, s.pos));
    const closing = U.dot(U.sub(s.vel, t.vel), rhat);
    const along = U.dot(want, rhat);
    if (Math.abs(closing) < 1) return 'burn';
    return along * closing < 0 ? 'brake' : 'burn';
  }

  // Inside the band the order aims for, so a zero-thrust coast means "arrived" rather than "cruising".
  function bandOf(s, t, order) {
    const standoff = order.type === 'intercept' ? (order.range != null ? order.range : 2000) : order.type === 'evade' ? (order.range || U.dist(s.pos, t.pos)) : order.type === 'approach' ? ((OD.Autopilot && typeof OD.Autopilot.brakeRange === 'function' ? OD.Autopilot.brakeRange(s, order) : (order.brakeAt || 200e3)) / 2) : (order.range || 200e3);
    const band = Math.max(400, standoff * (order.type === 'evade' ? 0.3 : order.band != null ? order.band : 0.12));
    return { standoff, band };
  }

  function atGoal(s, t, order) {
    if (!t) return false;
    if (order.type === 'matchv') return U.len(U.sub(s.vel, t.vel)) < 0.5;
    const { standoff, band } = bandOf(s, t, order);
    return Math.abs(U.dist(s.pos, t.pos) - standoff) <= band;
  }

  // Step size for the forward simulation: coarse in open space, fine near the goal, where the approach
  // controller needs steps much shorter than the time it takes to cross the band or it hunts around it.
  function stepFor(time, s, t, order) {
    let dt = time < 600 ? 4 : time < 3600 ? 10 : 20;
    if (!t) return dt;
    const relV = U.len(U.sub(s.vel, t.vel));
    if (order.type === 'matchv') return relV < 200 ? Math.min(dt, 2) : dt;
    const { standoff, band } = bandOf(s, t, order);
    const gap = Math.abs(U.dist(s.pos, t.pos) - standoff);
    const tGo = (gap + band) / Math.max(relV, 1);
    if (gap <= band) return Math.min(dt, standoff < 20e3 ? 1 : 4);
    if (tGo < 240) dt = Math.min(dt, Math.max(1, tGo / 30));
    return dt;
  }

  function orderKey(order) {
    return [order.type, order.target || '', order.range || '', order.vmax || '', order.band || '', order.heading != null ? order.heading.toFixed(2) : '', order.throttle != null ? order.throttle.toFixed(2) : ''].join('|');
  }

  const hypo = new Map(); // ship.id + key → plan, for button previews

  // Forward-simulate one ship's order. The target is assumed to coast under gravity (an honest guess: a burning
  // target rewrites the plan every second anyway). Attitude is simplified: the nose points where the order
  // wants after a turn that takes the hull's real turn time, so every reversal costs a flip's worth of coast.
  function plan(sim, ship, orderArg) {
    const order = orderArg || ship.order || { type: 'hold' };
    const key = orderKey(order) + '|' + (order.target ? '' : ship.target || '');
    const now = performance.now();
    if (!orderArg && ship._plan && ship._plan.key === key && sim.time - ship._plan.t0 < 2 && now - ship._plan.real < 1500) return ship._plan;
    if (orderArg) { const h = hypo.get(ship.id + '|' + key); if (h && sim.time - h.t0 < 2 && now - h.real < 1500) return h; }

    const out = { key, t0: sim.time, real: now, order: { ...order }, pts: [], flip: null, brake: null, arrive: null, crash: null, dry: false, time: 0, dv: 0, dv0: ship.deltaV(), peakV: 0, turnFirst: 0, feasible: true, active: false };
    const targetShip = order.target ? sim.byId(order.target) : null;
    const movable = MOVABLE[order.type] && (order.type === 'manual' || order.type === 'retreat' || (targetShip && !targetShip.destroyed));
    if (!movable || ship.disabled || ship.destroyed || ship.accel() <= 0) { store(); return out; }
    out.active = true;

    const s = shipLike(ship);
    const t = targetShip ? { id: targetShip.id, pos: { x: targetShip.pos.x, y: targetShip.pos.y }, vel: { x: targetShip.vel.x, y: targetShip.vel.y }, faction: targetShip.faction } : null;
    let time = 0, dvSpent = 0, peakV = 0;
    let pointing = ship.heading, turnLeft = 0, turnStart = null;
    let lastThrustPhase = null, arrivedFor = 0;
    const push = (ph) => out.pts.push({ x: s.pos.x, y: s.pos.y, t: time, phase: ph });
    push('coast');
    const stepLimit = order.type === 'retreat' || order.type === 'manual' ? 1800 : HORIZON;

    while (time < stepLimit) {
      const dt = stepFor(time, s, t, order);
      const aMax = s.accel();
      const want = AP.desired(s, order, t, aMax, sim).want;
      const mag = U.len(want);
      let thrustA = 0, ph = 'coast';
      if (turnLeft > 0) { turnLeft -= dt; ph = 'turn'; }
      else if (aMax > 0 && mag > AP.COAST_FRACTION * aMax) {
        const dir = U.angleOf(want);
        const err = Math.abs(U.angleDiff(dir, pointing));
        if (err > AP.ALIGN_TOL) {
          turnLeft = AP.turnTimeFor(s, err) - dt; pointing = dir; ph = 'turn';
          turnStart = { x: s.pos.x, y: s.pos.y, t: time };
          if (time === 0) out.turnFirst = AP.turnTimeFor(s, err);
        } else {
          thrustA = Math.min(mag, aMax);
          ph = classify(s, t, want, order);
          if (ph === 'brake' && lastThrustPhase === 'burn' && !out.flip) out.flip = turnStart || { x: s.pos.x, y: s.pos.y, t: time };
          if (ph === 'brake' && !out.brake) out.brake = { x: s.pos.x, y: s.pos.y, t: time };
          lastThrustPhase = ph;
        }
      }
      let acc = sim.gravity(s.pos);
      if (thrustA > 0) {
        acc = U.add(acc, U.fromAngle(pointing, thrustA));
        const mdot = ((s.thrust * s.systems.drive * (s.overheated ? 0.25 : 1)) / s.exhaustVelocity) * (thrustA / aMax);
        s.propMass = Math.max(0, s.propMass - mdot * dt);
        dvSpent += thrustA * dt;
      }
      s.vel.x += acc.x * dt; s.vel.y += acc.y * dt; s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt;
      if (t) { const g = sim.gravity(t.pos); t.vel.x += g.x * dt; t.vel.y += g.y * dt; t.pos.x += t.vel.x * dt; t.pos.y += t.vel.y * dt; }
      time += dt;
      const relV = t ? U.len(U.sub(s.vel, t.vel)) : U.len(s.vel);
      if (relV > peakV) peakV = relV;
      push(ph);
      if (sim.body && U.len(s.pos) < sim.body.radius) { out.crash = { x: s.pos.x, y: s.pos.y, t: time }; break; }
      if (s.propMass <= 0) { out.dry = true; break; }
      if (t && thrustA === 0 && turnLeft <= 0 && atGoal(s, t, order)) { arrivedFor += dt; if (arrivedFor >= 30) { out.arrive = { x: s.pos.x, y: s.pos.y, t: time - 30 }; break; } }
      else arrivedFor = 0;
    }
    out.time = out.arrive ? out.arrive.t : time;
    out.dv = dvSpent;
    out.peakV = peakV;
    out.feasible = !out.dry && !out.crash && dvSpent <= out.dv0;
    store();
    return out;

    function store() { if (orderArg) { hypo.set(ship.id + '|' + key, out); if (hypo.size > 64) hypo.delete(hypo.keys().next().value); } else ship._plan = out; }
  }

  // Seconds from now until a plan event, given when the plan was made.
  function eta(sim, p, ev) { return ev ? Math.max(0, ev.t - (sim.time - p.t0)) : null; }

  function summary(p) {
    if (!p || !p.active) return '';
    if (p.crash) return '会撞上地面';
    if (!p.feasible) return '需要 ' + fmt.dv(p.dv) + ' · 不够';
    return '≈ ' + fmt.time(p.time) + ' · ' + fmt.dv(p.dv);
  }

  // ---- navigator: one plain sentence about what the ship is doing, and one about what comes next -------------
  function narrate(sim, ship) {
    const L = (phase, text, sub) => ({ phase, text, sub: sub || '' });
    if (ship.destroyed) return L('lost', '全员阵亡。');
    if (ship.captured) return L('captured', '俘获班组已登舰。她现在为' + OD.Ships.FACTIONS[ship.faction].short + '飞。');
    if (ship.disabled) return L('disabled', '已失能。没有推进器，也离不开这条轨迹。');
    if (ship.role === 'station') return L('station', '没有推进器。空间站留在轨道上。', '其他船只能绕着它机动。');
    const order = ship.order || { type: 'hold' };
    const target = order.target ? sim.byId(order.target) : ship.target ? sim.byId(ship.target) : null;
    const tname = target ? target.name : '目标';
    const pre = ship.overheated ? '热沉已满：推进器只剩四分之一，所有炮位停火。' : '';
    if (ship.flagsGround && sim.body) return L('avoid', '避障。正顺行点火，把最低点抬到 ' + sim.body.name + ' 之上。', '自动驾驶不会飞一段会撞地的滑行。');
    if (ship.propMass <= 0) return L('dry', '推进剂见底。只能沿这条轨迹一直滑下去。', '只有港口或补给站能把推进剂补回船上。');
    const burning = ship.throttle > 0.01;
    const err = Math.abs(U.angleDiff(ship.cmdHeading != null ? ship.cmdHeading : ship.heading, ship.heading));
    const turning = !burning && err > AP.ALIGN_TOL && !!ship.plannedAccel;
    const g = (a) => fmt.num(a / 9.80665, 2) + ' g';
    const p = plan(sim, ship);
    const tFlip = eta(sim, p, p.flip), tBrake = eta(sim, p, p.brake), tArr = eta(sim, p, p.arrive);
    const phaseNow = burning && ship.plannedAccel ? classify(ship, target, ship.plannedAccel, order) : null;
    const rel = target ? U.len(U.sub(ship.vel, target.vel)) : 0;

    switch (order.type) {
      case 'intercept':
      case 'evade':
      case 'keeprange': {
        if (!target) return L('idle', pre + '这条指令没有目标。' + tap() + '一个接触来指定。');
        const holding = order.type !== 'intercept';
        const want = holding ? '在距 ' + tname + ' ' + fmt.dist(order.range || 200e3) + ' 处保持' : '靠上 ' + tname;
        if (turning) return L('turn', pre + '转向 ' + fmt.deg(err).replace('°', '') + '°，把舰首对准点火方向。', '推力只从舰尾喷出，所以每次点火都先转向。这型舰体大约要 ' + fmt.time(AP.turnTimeFor(ship, err)) + '。');
        if (burning && ship.throttle < 0.35 && atGoal(ship, target, order)) return L('trim', pre + (holding ? '微调与 ' + tname + ' 的距离。' : '微调靠泊 ' + tname + '。'), '小幅修正点火把漂移压在零附近。');
        if (burning && phaseNow === 'burn') return L('burn', pre + '正加速飞向 ' + tname + '，' + g(ship.accel() * ship.throttle) + '。', tFlip != null ? fmt.time(tFlip) + ' 后掉头，然后反推减速。' : tArr != null ? fmt.time(tArr) + ' 后到达。' : '');
        if (burning && phaseNow === 'brake') return L('brake', pre + '掉头反推，还要消掉 ' + fmt.speed(rel) + '。', tArr != null ? fmt.time(tArr) + ' 后' + want + '，之后还剩 ' + fmt.dv(Math.max(0, ship.deltaV() - p.dv)) + '。' : '反推会把舰尾对着目标，而舰尾装甲是全舰最薄的。');
        if (burning) return L('burn', pre + '正点火飞向' + want + '。', tArr != null ? fmt.time(tArr) + ' 后到达。' : '');
        if (p.arrive && p.arrive.t <= 4) return holding ? L('hold', pre + '在距 ' + tname + ' ' + fmt.dist(order.range || 200e3) + ' 处保持。舰首朝前滑行，不消耗推进剂。', '只有漂移会把舰带出允许范围时，自动驾驶才点火。') : L('arrived', pre + '已靠上 ' + tname + '，速度匹配。', rel > 5 ? '还有 ' + fmt.speed(rel) + ' 的漂移。' : '可以接舷或拖带了。');
        if (p.crash) return L('warn', pre + '这个计划最后会撞上 ' + (sim.body ? sim.body.name : '地面') + '。', '自动驾驶会中断计划去抬高轨道，到达时间会往后拖。');
        if (!p.feasible) return L('warn', pre + '这次转移需要 ' + fmt.dv(p.dv) + '，船上只剩 ' + fmt.dv(ship.deltaV()) + '。', '压低巡航速度，或者选一个更近的保持距离。');
        return L('coast', pre + '正滑向 ' + tname + (order.vmax ? '，压着巡航上限' : '') + '，相对速度 ' + fmt.speed(rel) + '。', tBrake != null ? fmt.time(tBrake) + ' 后开始反推。' : tArr != null ? fmt.time(tArr) + ' 后到达。' : '');
      }
      case 'matchv':
        if (!target) return L('idle', pre + '没有可匹配的目标。' + tap() + '一个接触。');
        if (turning) return L('turn', pre + '转向，把舰首对准漂移的反方向。', '大约 ' + fmt.time(AP.turnTimeFor(ship, err)) + '。');
        if (burning) return L('brake', pre + '正在消除与 ' + tname + ' 的相对运动，还剩 ' + fmt.speed(rel) + '。', '相对速度归零后，距离就不再变化。');
        return L('hold', pre + '已与 ' + tname + ' 速度匹配。', '在任一方点火之前，距离保持在 ' + fmt.dist(U.dist(ship.pos, target.pos)) + '。');
      case 'retreat': {
        const threat = target || sim.nearestHostile(ship);
        if (!threat) return L('coast', pre + '没有可逃的目标。滑行。');
        if (turning) return L('turn', pre + '转向，把舰尾朝向 ' + threat.name + '。', '撤退点火会把推进器对着敌人。');
        return L('burn', pre + '正全力背离 ' + threat.name + '。', '舰尾对着她，而那里装甲最薄。距离正以 ' + fmt.speed(Math.max(0, -U.dot(U.sub(threat.vel, ship.vel), U.norm(U.sub(threat.pos, ship.pos))))) + ' 拉开。');
      }
      case 'manual':
        if (turning) return L('turn', pre + '转向航向 ' + fmt.deg(order.heading || 0) + '。');
        return L(burning ? 'burn' : 'coast', pre + '手动：航向 ' + fmt.deg(order.heading || 0) + '，推力 ' + Math.round((order.throttle || 0) * 100) + '%。', burning ? '每分钟花掉 ' + fmt.speed(ship.accel() * ship.throttle * 60) + ' 速度增量。' : '设一个推力档位才能点火。');
      case 'hold':
      default: {
        if (burning) return L('burn', pre + '正在点火。');
        const orb = sim.body ? P.orbitalElements(sim.body.mu, ship.pos, ship.vel) : null;
        const lo = orb && orb.bound ? fmt.dist(orb.periapsis - sim.body.radius) : '', hi = orb && orb.bound ? fmt.dist(orb.apoapsis - sim.body.radius) : '';
        const sub = orb && orb.bound ? '高度 ' + (lo === hi ? lo + '，圆轨道' : lo + ' 至 ' + hi) + '。' + (orb.periapsis < sim.body.radius ? ' 最低点已在表面以下。' : '') : target ? '舰首保持朝向 ' + tname + '。' : '';
        return L('coast', pre + '正在' + (sim.body ? '绕 ' + sim.body.name : '') + '滑行。不下指令就不消耗任何东西。', sub);
      }
    }
  }

  // ---- a one-line tip for the moment, when the situation has an obvious next step -----------------------
  function suggest(sim, ship) {
    if (!ship || ship.disabled || ship.destroyed || ship.role === 'station' || ship.faction !== sim.playerFaction) return null;
    const order = ship.order || { type: 'hold' };
    const target = ship.target ? sim.byId(ship.target) : null;
    const hostile = sim.nearestHostile(ship);
    const cls = OD.Ships.CLASSES[ship.cls];
    const load = ship.thermalLoad();
    if (sim.body) {
      const el = P.orbitalElements(sim.body.mu, ship.pos, ship.vel);
      if (el.bound && el.periapsis < sim.body.radius && order.type === 'hold') return '这段滑行最后会撞上 ' + sim.body.name + '。朝当前运动方向点火可以把最低点抬起来。';
    }
    if (load > 0.7 && !ship.radiators.deployed && (!hostile || U.dist(hostile.pos, ship.pos) > 600e3)) return '热沉在 ' + Math.round(load * 100) + ' %。把散热板展开。600 公里内没有敌舰能打掉它们。';
    if (order.type === 'hold') {
      if (!target && hostile) return '先选目标。' + tap() + '地图上的一个接触' + (narrow() ? '。' : '，或者列表里的。');
      if (target && sim.isHostile(target, ship)) return '保持 ' + fmt.dist(cls.doctrine.range || 200e3) + ' 的距离，就是在这型舰体的条令射程上打。拦截则会一直靠近到接舷距离。';
      if (target && !sim.isHostile(target, ship)) return '拦截就是去交会。自动驾驶会点火，半路掉头，再反推停在她旁边。';
      if (!target && !hostile) return '还没有目标。' + tap() + '一艘舰船，把它设为目标。';
    }
    if (ship.deltaV() / ship.deltaVFull() < 0.2 && order.type === 'intercept' && !order.vmax) return '速度增量只剩满箱的 ' + Math.round((ship.deltaV() / ship.deltaVFull()) * 100) + ' %。压住巡航速度能让转移更慢，但便宜得多。';
    return null;
  }

  const Guide = { plan, narrate, suggest, summary, eta, classify, atGoal, mark: null };
  OD.Guide = Guide;
})();
