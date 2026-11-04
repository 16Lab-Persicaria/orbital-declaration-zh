/* Orbital Declaration — story mode. Eight chapters, 2211, the Jovian system. */
(function () {
  'use strict';
  const OD = window.OD;
  const U = OD.U, P = OD.P;
  const B = P.bodies;
  const km = (v) => v * 1000;
  // v15: a touch screen taps and has no shift key or Tab; a narrow screen puts the ship panel under the map.
  // The verb follows the pointer (a landscape tablet is wide and still taps), the layout words follow the width.
  const narrow = () => typeof window !== 'undefined' && window.innerWidth < 900;
  const touch = () => { if (typeof window === 'undefined') return false; try { if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true; } catch (e) { /* no media queries */ } return window.innerWidth < 900; };

  const say = (speaker, text) => ({ speaker, text, kind: 'comms' });
  const logAt = (time, speaker, text) => ({ when: { time }, actions: [{ log: { speaker, text } }] });
  const hintAt = (when, id, text, anchor, until) => ({ when, actions: [{ hint: { id, text, anchor, until } }] });
  // A hint whose text carries a number only the running sim knows: make(sim) returns the hint object, or null.
  const hintFrom = (when, make) => ({ when, actions: [{ fn: (sim) => { const h = make(sim); if (h) sim.hint(h); } }] });
  // A range as a hint should say it: rounded to the nearest 10 km, in the panel's own format.
  const kmAbout = (m) => U.fmt.dist(Math.round(m / 10000) * 10000);
  // v8 helpers: conditions on the engagement module, all guarded so a chapter runs without it.
  const E = () => OD.Engagement;
  const playerShips = (sim) => sim.ships.filter((x) => x.faction === sim.playerFaction && !x.destroyed && x.role !== 'station');
  const inbound = (sim, kind) => { const e = E(); if (!e || !e.threats) return false; try { return (e.threats(sim) || []).some((t) => t.kind === kind && (sim.byId(t.targetId) || {}).faction === sim.playerFaction); } catch (err) { return false; } };
  const hasAction = (sim, id) => { const e = E(); if (!e || !e.panelActions) return false; return playerShips(sim).some((x) => { try { return (e.panelActions(x) || []).some((a) => a.id === id); } catch (err) { return false; } }); };
  // v11 helpers: the sensor picture, guarded so a chapter runs without the module.
  const trackQ = (sim, id) => { const S = OD.Sensors, t = sim.byId(id); if (!S || !t || t.destroyed) return 3; try { return S.quality(sim, { faction: sim.playerFaction }, t); } catch (e) { return 3; } };
  const seenQ = (sim, ownId) => { const S = OD.Sensors, me = sim.byId(ownId); if (!S || !me || me.destroyed) return 3; let best = 0; for (const h of sim.hostiles(me)) { try { best = Math.max(best, S.quality(sim, h, me)); } catch (e) { /* ignore */ } } return best; };
  const hasDecision = (sim, kind) => Array.isArray(sim.decisions) && sim.decisions.some((d) => !kind || d.kind === kind);
  const hostileRadiatorsOut = (sim, within) => sim.ships.some((h) => h.faction !== sim.playerFaction && !h.destroyed && h.radiators && h.radiators.state > 0.9 && playerShips(sim).some((p) => U.dist(p.pos, h.pos) < within));
  // The range from which the best hostile sensor could hold a firing solution on this hull with its drive dark.
  // Solution range goes as the square root of the signature, so the plume comes out of the number the same way
  // the radiators card takes the panels out of it.
  const coldSolutionRange = (sim, id) => {
    const S = OD.Sensors, s = sim.byId(id);
    if (!S || !s) return 0;
    try {
      const seen = S.seenFrom(sim, s), sig = S.signature(s);
      if (!(seen.solution > 0) || !(sig.total > 0)) return 0;
      return seen.solution * Math.sqrt(Math.max(1, sig.total - (sig.plume || 0)) / sig.total);
    } catch (e) { return 0; }
  };
  // Chapter 2: Sabre flown by hand, on Larkspur, at her own doctrine range.
  const sabreOnLarkspur = (sim, t) => {
    t.target = 'larkspur'; t.weaponsFree = true;
    if (!t.order || t.order.type !== 'keeprange' || t.order.target !== 'larkspur') {
      t.order = { type: 'keeprange', target: 'larkspur', range: ((OD.Ships.CLASSES[t.cls] || {}).doctrine || {}).range || km(250) };
    }
  };
  // Chapter 2 is lost two ways, and the debrief has to say which one happened: a freighter gone, or Larkspur
  // out of the fight with the convoy still flying. Reads the fight the debrief is about, so a loss with both
  // haulers alive never prints "The freighters were lost."
  const ch2Loss = () => {
    const sim = OD.Game && OD.Game.sim;
    if (!sim || sim.name !== 'Picket Line' || typeof sim.byId !== 'function') return 'convoy';
    const failed = (sim.objectives || []).find((o) => o.failed && !o.optional);
    if (failed && (failed.id === 'p1' || failed.id === 'p2')) return 'convoy';
    const gone = (id) => { const s = sim.byId(id); return !!(s && (s.destroyed || s.captured || s.disabled)); };
    if (gone('hauler1') || gone('hauler2')) return 'convoy';
    if (gone('larkspur')) return 'larkspur';
    return 'convoy';
  };
  const CH2_DEFEAT = {
    convoy: '货船没了。管理局有了它要的事件，内行星会被告知是盟约先开的火。',
    larkspur: 'Larkspur 在 Ganymede (木卫三) 上空退出战斗。Ochre Sky 和 Pale Harbour 正毫无护航地奔向 Galileo Regio (伽利略区)。',
  };
  // ------------------------------------------------------------ how a fight ended (the debriefs)
  // A debrief is read over the fight it is about, so every sentence that says what happened to a hull
  // reads that hull. main.js takes chapter.victory or chapter.defeat at the moment the chapter ends,
  // so those are getters. A hostile now leaves a fight four ways — boarded, wrecked, adrift, or driven
  // off under sim.js's drivenOffStep — and a driven-off hull is still flying, so she is never called
  // adrift or destroyed. With no sim to read the getters fall back to the plain line.
  const endSim = (name) => {
    const sim = OD.Game && OD.Game.sim;
    return sim && typeof sim.byId === 'function' && (!name || sim.name === name) ? sim : null;
  };
  const pctOf = (v) => Math.round(U.clamp(v == null ? 1 : v, 0, 1) * 100) + ' %';
  const isOut = (s) => !!(s && (s.destroyed || s.captured || s.disabled));                  // out of the fight on her hull
  const isDone = (s) => !!(s && (s.destroyed || s.captured || s.disabled || s.drivenOff));  // out of this fight, either way
  // Our hulls that can still fight. An empty list is how a chapter is lost with the thing we were
  // guarding still in one piece.
  const ableShips = (sim) => (sim ? playerShips(sim).filter((s) => !s.disabled && !s.captured).length : 1);
  // Interceptors still in the bays, counted off the mounts so the line works without the engagement module.
  const baysLeft = (s) => { let n = 0; for (const m of (s && s.mounts) || []) if (m.kind === 'launcher') n += Math.max(0, m.count || 0); return n; };
  // Her range from the nearest of our fighting hulls, in the format a hint uses.
  const rangeFromUs = (sim, s) => { let best = 0; for (const p of playerShips(sim)) { const d = U.dist(p.pos, s.pos); if (!best || d < best) best = d; } return best ? kmAbout(best) : ''; };
  // What put her out of the fight, in the words engagement.js disables a hull with: a wrecked drive, or
  // a hull too far open to manoeuvre with.
  const adriftWhy = (s) => ((s.systems && s.systems.drive <= 0) ? '推进器报废。' : '舰体完整度 ' + pctOf(s.hull) + '。');
  // Why her computer broke off, in the words sim.js logs the drive-off with.
  const brokeOffWhy = (s) => (s.hull < 0.35 ? '舰体只剩 ' + pctOf(s.hull)
    : (s.systems && s.systems.drive < 0.3) ? '推进器只剩 ' + pctOf(s.systems.drive)
    : '推进剂快见底');
  // One sentence for how a hostile ended, with the number that says it.
  const endedAs = (sim, id, name) => {
    const s = sim && sim.byId(id);
    if (!s) return name + ' 退出了战斗。';
    if (s.captured) return name + ' 被登舰俘获。';
    if (s.destroyed) return name + ' 解体了，舰体归零。';
    if (s.disabled) return name + ' 退出战斗，失控漂流，' + adriftWhy(s);
    if (s.drivenOff) {
      const R = rangeFromUs(sim, s);
      return name + ' 脱离，' + brokeOffWhy(s) + '，掉头跑了。' +
        (R ? '她在 ' + R + ' 外，还在拉开。' : '她已在一千五百公里外，还在拉开。') +
        ' 她退出了这场战斗。';
    }
    return name + ' 还在飞。';
  };
  // The same in four words, for a line that covers more than one hull.
  const endedShort = (sim, id, name) => {
    const s = sim && sim.byId(id);
    if (!s) return name + ' 退出了战斗';
    if (s.captured) return name + ' 被俘获';
    if (s.destroyed) return name + ' 解体了';
    if (s.disabled) return name + ' 失控漂流';
    if (s.drivenOff) return name + ' 脱离跑了';
    return name + ' 还在飞';
  };
  // One of ours, in the same terms, for the debriefs that say what a ship of ours came home as.
  const ourEnd = (s, name) => {
    if (!s) return name + ' 退出了战斗。';
    if (s.destroyed) return name + ' 没了。';
    if (s.captured) return name + ' 被登舰俘获。';
    if (s.disabled) return name + ' 退出战斗，失控漂流，' + adriftWhy(s);
    if (s.hull < 0.995) return name + ' 只剩 ' + pctOf(s.hull) + ' 舰体完整度，还在飞。';
    return '没有东西穿过去 ' + name + ' 的装甲。';
  };
  const COUNT = ['零', '一', '二', '三', '四', '五', '六', '七', '八'];
  // The range at which her beams burn through the facet of ours she is looking at, from the same ladder the map draws.
  const theirBurnThrough = (sim, ownId, foeId) => {
    const e = E(), me = sim.byId(ownId), foe = sim.byId(foeId);
    if (!e || typeof e.reach !== 'function' || !me || !foe) return 0;
    try {
      const t = (e.reach(sim, me, foe) || {}).their;
      if (!t || !t.beams) return 0;
      if (t.facet && t.beams[t.facet] > 0) return t.beams[t.facet];
      // facet unknown: the shortest of the three, so an unknown face never reads as the softest one
      const v = [t.beams.nose, t.beams.flank, t.beams.tail].filter((x) => x > 0);
      return v.length ? Math.min.apply(null, v) : 0;
    } catch (err) { return 0; }
  };

  const chapters = [
    {
      n: 1, id: 'cold-equations', title: '冷酷方程', simName: 'Cold Equations', location: 'Callisto (木卫四) 轨道', date: '2211 年 3 月 14 日',
      brief: [
        '你是木星盟约的指挥官 Halvorsen，带着护卫艇 JCS Larkspur 驻在 Callisto (木卫四) 轨道上。再有两周，各卫星就要对《宣言》投票；整个冬天，内星系管理局一直在拦停盟约的船做检查。目前还没有人开火。',
        '四十分钟前，油轮 JCV Long Meridian 在离开 Valhalla Station (瓦尔哈拉站) 后的滑行段上失去了主推进器。船上十九名船员还活着。她正沿一条椭圆轨道下坠，不到两小时就会撞上 Callisto (木卫四) 表面，而盟约抽不出第二艘油轮。',
        '去把她带回来。Larkspur 的推进剂是满的，有 51 公里/秒的速度增量。速度增量就是你的推进剂还能加出来或减掉的速度，每次点火都要花掉一些。只有最后和目标同速同向，才算真正靠上去，光在旁边不算。舰只朝舰首方向推，所以想减速，得先掉头，再朝反方向点火。',
      ],
      comms: [say('Navigation', 'Long Meridian 在海图上了，没有尾焰。她船上没有任何东西能让自己停下来。如果我们不去拦住她，两小时后她就到地面了。')],
      // Nobody tows her: the rendezvous trigger gives her drive back and the player flies her home, so
      // the line says what the objective actually measured.
      victory: 'Long Meridian 已经回到 Valhalla Station (瓦尔哈拉站) 100 公里内，主推进器重新点着了。十九名船员都在船上。这艘油轮还能再飞。',
      // Two ways to lose it: the tanker on the surface, or Larkspur gone with the tanker still falling.
      get defeat() {
        const sim = endSim(chapters[0].simName);
        const m = sim && sim.byId('meridian'), l = sim && sim.byId('larkspur');
        const advice = ' 早点开始减速，并且留够最后反推用的速度增量。';
        if (m && !m.destroyed && isOut(l)) {
          return 'Larkspur 在 Callisto (木卫四) 上空退出战斗。Long Meridian 还在下坠，这里没有别的船来得及救她。' + advice;
        }
        return 'Long Meridian 带着十九名船员坠毁在 Callisto (木卫四) 上。' + advice;
      },
      build() {
        const body = B.callisto;
        return {
          name: 'Cold Equations', body, sunAngle: -0.8, playerFaction: 'JC',
          controls: { orders: ['intercept', 'hold'] },
          ships: [
            { id: 'larkspur', name: 'JCS Larkspur', cls: 'corvette', faction: 'JC', player: true, orbit: { altitude: km(1800), angle: 0.2 }, heading: 1.2 },
            { id: 'meridian', name: 'JCV Long Meridian', cls: 'freighter', faction: 'CIV', orbit: { altitude: km(2600), angle: 0.9, velScale: 0.77 }, radiatorsOut: true, propFraction: 0.5, systems: { drive: 0 }, crew: null },
            { id: 'valhalla', name: 'Valhalla Station', cls: 'station', faction: 'JC', orbit: { altitude: km(1800), angle: -0.9 } },
          ],
          objectives: [
            { id: 'rv', text: '靠到 JCV Long Meridian 旁边，保持在 5 公里内、相对速度低于 10 米/秒', type: 'rendezvous', ship: 'larkspur', target: 'meridian', range: 5000, speed: 10, hold: 30 },
            { id: 'home', text: '把 JCV Long Meridian 带到 Valhalla Station (瓦尔哈拉站) 100 公里内', type: 'reach', ship: 'meridian', target: 'valhalla', range: km(100), speed: 80, hold: 5, inactive: true },
          ],
          intro: [say('Navigation', 'Long Meridian 在海图上了，没有尾焰。她船上没有任何东西能让自己停下来。如果我们不去拦住她，两小时后她就到地面了。')],
          triggers: [
            // The stakes, on the map: where and when the tanker comes down if nobody burns.
            { when: { time: 0.5 }, actions: [{ fn: (sim) => {
              const m = sim.byId('meridian'); if (!m) return;
              const pts = sim.predictPath(m, 5 * 3600, 600);
              if (pts.length < 600) { const last = pts[pts.length - 1]; sim.flags.impactT = pts.length * 30; sim.markers.push({ id: 'impact', pos: last, color: '#ff6b6b', radius: km(60), label: 'Long Meridian 会落在这里' }); }
            } }, { log: { speaker: 'Navigation', text: '如果没人点火，她大约两小时后会到地面。红圈就是落点。' } }] },
            { when: (sim) => { const mk = sim.markers.find((x) => x.id === 'impact'); if (mk && sim.flags.impactT != null) { const left = sim.flags.impactT - sim.time; mk.label = 'Long Meridian 会落在这里' + (left > 0 ? '，' + U.fmt.time(left) + ' 后' : ''); } return false; }, actions: [] },
            // Guided tour, six steps.
            { when: { time: 1 }, actions: [{ hint: { id: 't2', step: [1, 5], text: 'JCV Long Meridian 没有推进器，正朝 Callisto (木卫四) 下坠。' + '点地图上的她，把她设成 Larkspur 的目标。Larkspur 是你的船，她的面板在' + (narrow() ? '地图下方' : '右侧') + '，她收到的每条指令都发给当前目标。', mark: 'meridian', markLabel: touch() ? '点按设为目标' : '点击设为目标', until: (sim) => { const s = sim.byId('larkspur'); return s && s.target === 'meridian'; } } }] },
            { when: (sim) => { const s = sim.byId('larkspur'); return s && s.target === 'meridian'; }, actions: [{ hint: { id: 't3', step: [2, 5], text: '拦截按钮现在显示大约 18 分钟、12 公里/秒，而 Larkspur 的推进剂箱里有 51 公里/秒。' + (touch() ? '点拦截。' : '按拦截，或者按 I 键。') + ' 自动驾驶会把舰首对准她点火，半路掉头，再朝反方向点火，最后并排停住。', anchor: '[data-order="intercept"]', until: (sim) => sim.flags.orderedIntercept } }] },
            { when: (sim) => sim.flags.orderedIntercept, actions: [{ hint: { id: 't4', step: [3, 5], text: 'Larkspur 正在点火，她的规划路径画在前方。亮的部分是点火段，圈是掉头点，蓝灰段是掉头反推。按 16× 或快进把时间跑起来。掉头和到达前时间会自动降回 1×，不会错过。', anchor: '#warp', until: (sim) => !!sim.flags.flipHint } }] },
            { when: (sim) => { const s = sim.byId('larkspur'); return s && s.order.type === 'intercept' && s.stats.dvSpent > 1500 && Math.abs(U.angleDiff(s.cmdHeading, s.heading)) > 2.5 && !sim.flags.flipHint; }, actions: [{ flag: 'flipHint' }, { log: { speaker: 'Navigation', text: '掉头完成。从现在起掉头反推。' } }, { hint: { id: 't5', step: [4, 5], text: '过半了。舰首已经转过去，推进器现在正对 Long Meridian，所以从这一刻起，每一秒都在减速而不是加速。看面板里的速度增量条：斜纹那一段是这份计划接下来还要花的，随着她付出会越来越短。', anchor: '#shipPanel', until: (sim) => sim.objectives[0].done } }] },
            { when: { objective: 'rv' }, actions: [{ fn: (sim) => { const m = sim.byId('meridian'); if (m) { m.systems.drive = 1; if (OD.Damage && OD.Damage.repair) { try { OD.Damage.repair(m, 1); } catch (e) { /* the tanker flies either way */ } } m.faction = 'JC'; m.player = true; m.ai = false; m.order = { type: 'hold' }; m.target = 'valhalla'; } sim.markers = sim.markers.filter((x) => x.id !== 'impact'); if (OD.Game && OD.Game.sim === sim) OD.Game.select('meridian'); } }, { log: { speaker: 'JCV Long Meridian', text: 'Larkspur，你们的轮机员把我们的推进器修好了。她又重又慢，现在交给你操纵。' } }, { activate: 'home' }, { hint: { id: 't6', step: [5, 5], text: 'Long Meridian 的推进器修好了。她现在已被选中，目标也已经设成 Valhalla Station，所以直接按拦截。她是货船，加速度 2.5 米/秒²，而 Larkspur 是 13，所以这趟很慢。快进会把时间直接跑到下一事件。', anchor: '[data-order="intercept"]', until: (sim) => { const m = sim.byId('meridian'); return m && m.order.type === 'intercept'; } } }] },
            { when: (sim) => { const m = sim.byId('meridian'); return m && m.order.type === 'intercept' && !sim.flags.fullHint; }, actions: [{ flag: 'fullHint' }, { hint: { id: 't7', text: 'Long Meridian 正在返航。每次任务都是同一套：选目标、下指令、用速度增量付账。按 D，或者面板顶上的“精简”按钮，把其余数字显示出来。', anchor: '#pDetail' } }] },
            // The sink number the panel is showing at this moment leads the hint, so the two agree.
            { when: (sim) => { const s = sim.byId('larkspur'); return s && s.thermalLoad() > 0.45 && !sim.flags.heatHint; }, actions: [{ flag: 'heatHint' }, { fn: (sim) => {
              const s = sim.byId('larkspur'); if (!s) return;
              sim.hint({ id: 'h5', anchor: '#shipPanel',
                text: '你的热沉在 ' + Math.round(s.thermalLoad() * 100) + ' %，而且这次点火还在往上走。散热板展开时它就稳住了。战斗中按 X 收起散热板，热沉就会灌满。热沉满了，推进器只剩四分之一，所有炮位停火——包括点防御——直到它排空。',
                until: (s2) => { const t = s2.byId('larkspur'); return !t || t.thermalLoad() < 0.3 || s2.time > 1500; } });
            } }] },
            logAt(60, 'Valhalla Control', 'Larkspur，这里是控制中心。你可以机动了。Long Meridian 上有十九个人。'),
          ],
        };
      },
    },
    {
      n: 2, id: 'picket-line', title: '警戒线', simName: 'Picket Line', location: 'Ganymede (木卫三) 轨道', date: '2211 年 4 月 2 日',
      brief: [
        '你正带着 JCS Larkspur 在 Ganymede (木卫三) 上空，为两艘从 Galileo Regio (伽利略区) 出来的盟约货船护航。《宣言》签署才三天。内星系管理局不承认它，把派到这里的舰船叫作海关执法。',
        '管理局的护卫艇 ISV Sabre 已经跟了这支船队一个星期。今天早上，她横穿一艘满载货船的船首，近到把漆都烤焦了。把 Larkspur 挡在 Sabre 和货船之间，把她打出这场战斗。打瘫她，或者靠到 3 公里内、相对速度低于 25 米/秒，派班组登舰。不管哪种，货船都要回家。',
        'Sabre 正冷冷地滑行。在一千公里外，她在你的面板上只是一个接触：一个方位和大致距离，你对她也是一样。一点火，尾焰就给了对方射击解算，多远都一样。谁先点火，谁先被看见。',
        '她从天亮前就趴在货船航线上，散热板收着，所以热沉大约有 30 % 满。Larkspur 出发时是空的。拖得越久，对热沉更空的那艘越有利。',
      ],
      comms: [say('Galileo Regio', 'Sabre 是武装的，她的舰长手里有我们没见过的命令。舰首始终对着她。Larkspur 舰首有 20 厘米装甲，舷侧 8 厘米。她靠近时把散热板收起来，不是真要打就别点火。')],
      // Sabre can end this chapter four ways — taken, wrecked, adrift or driven off — and the freighters
      // are still on their way when it ends, so the line says which one happened and does not send the
      // convoy home early.
      get victory() {
        const sim = endSim('Picket Line');
        const t = sim && sim.byId('sabre');
        const head = sim ? endedAs(sim, 'sabre', 'Sabre') : 'Sabre 退出了战斗。';
        const convoy = ' Ochre Sky 和 Pale Harbour 还在飞，正前往 Galileo Regio (伽利略区)。';
        // What the Compact did to her: boarded her, put beams through her, or pushed her off the route.
        const last = t && t.captured ? ' 盟约俘获了一艘管理局军舰，两国政府都明白这意味着什么。'
          : !t || t.hull < 0.995 ? ' 盟约向一艘管理局军舰开了火，两国政府都明白这意味着什么。'
          : ' 盟约把一艘管理局军舰从盟约船队前逼退，两国政府都明白这意味着什么。';
        return head + convoy + last;
      },
      // main.js reads chapter.defeat when it builds the debrief, so the sentence is picked from the fight
      // that just ended: the convoy lost, or Larkspur lost with the convoy still flying.
      get defeat() {
        if (ch2Loss() !== 'larkspur') return CH2_DEFEAT.convoy;
        const sim = endSim('Picket Line');
        const t = sim && sim.byId('sabre');
        // She is only still on the picket line if she is still flying and fit to fight.
        return CH2_DEFEAT.larkspur + ' ' + (isDone(t) ? endedAs(sim, 'sabre', 'Sabre') : 'ISV Sabre 仍在警戒线上。');
      },
      build() {
        const body = B.ganymede;
        return {
          name: 'Picket Line', body, sunAngle: 0.4, playerFaction: 'JC',
          ships: [
            { id: 'larkspur', name: 'JCS Larkspur', cls: 'corvette', faction: 'JC', player: true, orbit: { altitude: km(3200), angle: 0 }, heat: 0 },
            // the convoy runs ahead of Larkspur, nearer Sabre than her beams reach: holding station leaves it to her
            { id: 'hauler1', name: 'JCV Ochre Sky', cls: 'freighter', faction: 'JC', ai: true, orbit: { altitude: km(3200), angle: 0.11 }, propFraction: 0.5 },
            { id: 'hauler2', name: 'JCV Pale Harbour', cls: 'freighter', faction: 'JC', ai: true, orbit: { altitude: km(3200), angle: 0.14 }, propFraction: 0.5 },
            // A picket: cold, radiators stowed, computer asleep until Larkspur shows herself (see the trigger
            // below). She has been lying doggo across the convoy route with the panels in, so her sink is
            // already 30 % full at 2 MW of idle heat — about forty minutes stowed — while Larkspur starts at
            // zero. That is the chapter's lesson on her side of the board: a long fight goes to the ship with
            // the emptier sink.
            { id: 'sabre', name: 'ISV Sabre', cls: 'corvette', faction: 'ISA', ai: false, orbit: { altitude: km(3600), angle: 0.16 }, propFraction: 0.8, heat: (OD.Ships.CLASSES.corvette || {}).sinkCapacity * 0.3, radiatorsOut: false, order: { type: 'hold' }, weaponsFree: true },
          ],
          objectives: [
            // The two minutes are the window for the prize: the card that offers the boarding comes up
            // when she stops manoeuvring, and the player still has to read it and order the run. An
            // intercept ordered on her inside that window holds the chapter open (the trigger below).
            { id: 'sabre', text: '使 ISV Sabre 失能（打瘫或登舰）', type: 'neutralize', targets: ['sabre'], hold: 120 },
            { id: 'p1', text: 'JCV Ochre Sky 存活', type: 'protect', ship: 'hauler1' },
            { id: 'p2', text: 'JCV Pale Harbour 存活', type: 'protect', ship: 'hauler2' },
          ],
          intro: [say('Galileo Regio', 'Sabre 是武装的，她的舰长手里有我们没见过的命令。舰首始终对着她，她靠近时把散热板收起来。')],
          triggers: [
            hintFrom({ time: 2 }, (sim) => {
              const s = sim.byId('larkspur'), t = sim.byId('sabre');
              const R = s && t ? kmAbout(U.dist(s.pos, t.pos)) : '1 000 km';
              return { id: 'h1', anchor: '#shipPanel',
                text: 'Sabre 就是地图上的那个 ?，' + R + ' 外。接触就是一个方位和大致距离。她在那条穿过 ? 的线上的某处。点她，把她设成目标。跟踪那一行会给我们对她的图像分级：接触、跟踪，再到好到可以瞄准的解算。',
                until: (s2) => { const a = s2.byId('larkspur'); return (a && a.target === 'sabre' && s2.time > 8) || s2.time > 240; } };
            }),
            hintFrom((sim) => sim.time > 12 && trackQ(sim, 'sabre') < 2.7, (sim) => {
              const R = coldSolutionRange(sim, 'larkspur');
              return { id: 'h1b', anchor: '#shipPanel',
                text: '冷着，Sabre 必须进到 ' + (R > 0 ? kmAbout(R) : '350 km') + ' 瞄准你。一点火，她就能在任意距离拿到解算。进场时把巡航速度压住。',
                until: (s2) => !!s2.flags.decisionAnswered || s2.time > 300 };
            }),
            // The band's keys are their own hint, on the first card the navigator raises.
            hintAt((sim) => hasDecision(sim), 'h1k', '导航官在决策栏上放了一个选择。按 1、2、3 作答，Esc 留到稍后，亮着的那个是她自己的建议。', '#decision', (sim) => !!sim.flags.decisionAnswered || sim.time > 900),
            hintAt((sim) => trackQ(sim, 'sabre') >= 2.7 && sim.time > 20, 'h1c', touch() ? '我们对 Sabre 有解算了，光束和线圈炮可以瞄准。手指按住她就能保持距离，或者点选她、在面板里按保持距离，Larkspur 会守在她这条战术条令规定的 250 公里上。' : '我们对 Sabre 有解算了，光束和线圈炮可以瞄准。右键点她就能保持距离，Larkspur 会守在她这条战术条令规定的 250 公里上。', '#shipPanel', (sim) => sim.time > 600 || trackQ(sim, 'sabre') < 2.7),
            hintAt((sim) => trackQ(sim, 'sabre') >= 2.7 && sim.time > 45, 'h1e', '“对方看到”那一行写的是 Sabre 正对着的我方装甲面。Larkspur 舰首 20 厘米、舰尾 4 厘米，所以舰首始终朝她。', '#shipPanel', (sim) => sim.time > 700 || trackQ(sim, 'sabre') < 2.7),
            hintFrom((sim) => seenQ(sim, 'larkspur') >= 2.7 && sim.time > 20, (sim) => {
              const R = theirBurnThrough(sim, 'larkspur', 'sabre');
              return { id: 'h1d', anchor: '#shipPanel',
                text: 'Sabre 对我们有解算，靠的是我们的尾焰或者炽热的散热板。点火一旦开始就藏不住，所以点完就收。在她进到 ' + (R > 0 ? kmAbout(R) : '190 km') + ' 之前，按 X 收起散热板，她的光束在那里能烧穿它们。',
                until: (s2) => seenQ(s2, 'larkspur') < 2.7 || s2.time > 400 };
            }),
            // The crossing is priced from the two fit crews, the way the sim charges it (OD.Sim.boardingPlan).
            hintFrom((sim) => { const t = sim.byId('sabre'); return !!(t && t.neutralised() && !t.captured && !t.destroyed); }, (sim) => {
              const t = sim.byId('sabre'), s = sim.byId('larkspur');
              const plan = OD.Sim && typeof OD.Sim.boardingPlan === 'function' && s && t ? OD.Sim.boardingPlan(s, t) : null;
              const across = plan && plan.known ? (plan.thrownBack ? '她那边能动的有 ' + plan.theirs + ' 人，我们这边 ' + plan.ours + ' 人，会把登舰班组打回来：改用火力打沉她。' : '登舰班组过去要 ' + U.fmt.time(plan.time) + '，对方能动的有 ' + plan.theirs + ' 人。') : '对方船员和我们差不多时，登舰班组过去大约要 90 秒；更多就更久。';
              return { id: 'h2', text: 'Sabre 已失能，目标达成。想把她当战利品俘获，就拦截她，保持在 3 公里内、相对速度低于 25 米/秒。' + across + ' 在班组飞过去和登舰期间，本章不会结束。', anchor: '#shipPanel', until: (sim2) => { const t2 = sim2.byId('sabre'); return !t2 || t2.captured || t2.destroyed || !!sim2.outcome; } };
            }),
            hintAt((sim) => sim.time > 30 && hasAction(sim, 'fire_full') && (sim.time > 600 || (() => { const s = sim.byId('larkspur'), t = sim.byId('sabre'); return !!(s && t && U.dist(s.pos, t.pos) < km(800)); })()), 'h3', '火控在面板底部，Larkspur 的武器已经放开。按 W 收住或放开，按 B 选光束模式。全力让每门光束都开火，热沉会灌满。持续把光束压到散热板排得掉的程度，所以她能一直打。到 Sabre 那条线上的刻度，标出双方各自的光束能烧穿。', '#pEng', (sim) => !!sim.flags.fireKeyUsed || sim.time > 700),
            { when: (sim) => { const s = sim.byId('larkspur'), t = sim.byId('sabre'); return !!(s && t && (seenQ(sim, 'larkspur') >= 2.7 || U.dist(s.pos, t.pos) < km(500) || sim.time > 900)); }, actions: [{ flag: 'sabreAwake' }, { fn: (sim) => { const t = sim.byId('sabre'); if (t && !t.neutralised()) { t.ai = true; t.radiators.deployed = true; } } }, { log: { speaker: 'Navigation', text: 'Sabre 看见我们了。她的散热板正在展开，推进器在预热。', kind: 'warn' } }] },
            // Sabre works on whatever she can hurt. While Larkspur is inside the range where Sabre's beams burn
            // through the face Larkspur is showing her, she leaves the freighters and fights the warship, flown
            // by hand (ai off) so the hull she is shooting at does not change back every two seconds. Open that
            // range, or turn a thicker face to her, and after half a minute the freighters are her problem again.
            // The twenty seconds is there so a flip in passing during a transfer is not a commitment.
            { when: (sim) => {
              const f = sim.flags, t = sim.byId('sabre'), s = sim.byId('larkspur');
              if (!f.sabreAwake || !t || t.destroyed || t.captured || t.neutralised()) return false;
              const R = theirBurnThrough(sim, 'larkspur', 'sabre');
              // Two things have to be true before she gives up the convoy: her beams burn through the face
              // Larkspur is showing her, and Larkspur is inside her own fighting range. The second gate is
              // what stops a corvette braking tail-first 600 km away — 4 cm of tail armour, so her beams
              // reach half the board — from pulling her off the freighters before the fight has started.
              const fightRange = (((OD.Ships.CLASSES[t.cls] || {}).doctrine || {}).range || km(250)) * 1.5;
              const able = !!(s && !s.destroyed && !s.disabled) && R > 0 && U.dist(s.pos, t.pos) < Math.min(R, fightRange);
              // Once she is in it and hurt she stays in it. Her computer would break off at 35 % of hull and
              // burn away, and an equal corvette with fuller tanks cannot be caught: the chapter would run
              // until the clock ran out with the prize 5 000 km away. Her captain has orders, so the hand
              // keeps her on Larkspur and the fight is decided here.
              const cornered = f.sabreOnUs && (t.hull < 0.35 || t.systems.drive < 0.3 || t.deltaV() < 2500);
              if (able || cornered) {
                f.sabreOutAt = null;
                if (f.sabreInAt == null) f.sabreInAt = sim.time;
                if (!f.sabreOnUs && sim.time - f.sabreInAt >= 20) {
                  f.sabreOnUs = true; t.ai = false; t.radiators.auto = true;
                  sim.addLog('Sabre 离开货船，转向我们。她在 ' + kmAbout(U.dist(s.pos, t.pos)) + ' 外，已经进入她能烧穿我们当前受弹面的距离。', 'Navigation', 'warn');
                  sim.hint({ id: 'h4', anchor: '#shipPanel', text: '按 V 打开舰体视图。它画的是 Larkspur 此刻的样子：散热板、炮位、尾焰都是它们的真实状态。在地图上放大也是一样的船。' });
                }
              } else {
                f.sabreInAt = null;
                if (f.sabreOutAt == null) f.sabreOutAt = sim.time;
                if (f.sabreOnUs && sim.time - f.sabreOutAt >= 30) {
                  f.sabreOnUs = false; t.ai = true;
                  sim.addLog('Sabre 回到货船那边了。她的光束够不到我们当前的受弹面。', 'Navigation', 'info');
                }
              }
              if (f.sabreOnUs) {
                sabreOnLarkspur(sim, t);
                if (OD.AI && OD.AI.thermalDoctrine) { try { OD.AI.thermalDoctrine(t, sim, s); } catch (e) { /* housekeeping only */ } }
              }
              return false;
            }, actions: [] },
            // A boarding ordered from the band is a clock, not a wish: while the party is on its way to Sabre
            // the neutralise objective stays open, so the prize is taken before the chapter ends. The window
            // is the run the card promised plus the 90 s across, and a run still closing inside 50 km keeps
            // the chapter open past it. A run that stops making ground lapses, with a line saying so.
            { when: (sim) => {
              const f = sim.flags;
              const o = (sim.objectives || []).find((x) => x.id === 'sabre'), t = sim.byId('sabre');
              if (!o || o.done || o.metAt == null || !t || t.captured || t.destroyed) return false;
              const ours = (s2) => s2.faction === sim.playerFaction && !s2.destroyed && !s2.disabled;
              const across = sim.ships.find((s2) => ours(s2) && s2.boarding && s2.boarding.target === 'sabre');
              // A run is on while one of ours is flying an intercept at Sabre: from the card, which also
              // ties her guns, or ordered by hand off the prize hint. Sabre is already out of the fight
              // by the time this trigger runs, so an intercept on her is a boarding run and nothing else.
              const runner = across || sim.ships.find((s2) => ours(s2) && (s2.order || {}).type === 'intercept' && (s2.order || {}).target === 'sabre');
              if (!runner) { f.boardRunFrom = null; f.boardRunCap = 0; f.boardRunBest = null; f.boardRunGain = null; return false; }
              const R = U.dist(runner.pos, t.pos);
              if (f.boardRunFrom == null) {
                f.boardRunFrom = sim.time;
                f.boardRunBest = R;
                f.boardRunGain = sim.time;
                // The window is the card's own promise: the run the autopilot says it will fly, plus the
                // 90 s the party needs across, plus a minute for the last correction. Ten minutes at most.
                const A = OD.Autopilot, B = (OD.Sim && OD.Sim.BOARD) || { time: 90 };
                let eta = 0;
                if (A && typeof A.estimate === 'function') { try { eta = A.estimate(runner, t).time || 0; } catch (e) { eta = 0; } }
                f.boardRunCap = Math.max(300, Math.min(900, Math.round(eta + B.time + 60)));
              }
              // Ground made toward her: every kilometre resets the clock on the last rule below.
              if (f.boardRunBest == null || R < f.boardRunBest - 1000) { f.boardRunBest = R; f.boardRunGain = sim.time; }
              // A party across holds the chapter open for as long as it takes. A run in gets its window,
              // and a run inside 50 km that is still making ground keeps the chapter open past it.
              const closing = R < km(50) && sim.time - (f.boardRunGain || sim.time) < 60;
              if (across || closing || sim.time - f.boardRunFrom < f.boardRunCap) { o.metAt = sim.time; f.boardRunLapsed = false; return false; }
              if (!f.boardRunLapsed) {
                f.boardRunLapsed = true;
                sim.addLog('俘获行动超时了。' + runner.name + ' 离 Sabre 还有 ' + kmAbout(R) + '。', 'Marines', 'warn');
              }
              return false;
            }, actions: [] },
          ],
        };
      },
    },
    {
      n: 3, id: 'radiator-weather', title: '散热板天气', simName: 'Radiator Weather', location: 'Europa (木卫二)，Conamara Station (科纳马拉站)', date: '2211 年 4 月 19 日',
      brief: [
        '你带着 JCS Larkspur 和护卫舰 JCS Anselm 在 Europa (木卫二) 上空。Conamara Station (科纳马拉站) 是给半个 Ganymede (木卫三) 供水的冰场，两艘内星系管理局护卫舰停在了它上方。',
        '她们已经压了九个小时的火，等着热沉灌满。敌人这么近，Conamara 一直收着散热板，热沉已经到了 88 %。再过大约一小时就满了，到时候空间站只能当着她们的光束把散热板展开。你一到，她们就会对空间站开火。打破这场围困。',
        '你自己的船也在这个时钟里。散热板只有展开时才排热，而展开时它又是舰体上最薄的东西。收着的每一分钟，热沉都在涨。热沉满了，推进器只剩四分之一，所有炮位停火——包括点防御——直到它排空。',
      ],
      comms: [say('Conamara Station', '盟约的船，这里是 Conamara。你们一到，她们就会对我们开火。热沉已经到 88 %，所以散热板还能再收大约一小时。之后我们只能当着她们的光束展开。')],
      // Either frigate can end adrift, wrecked, taken or driven off, so the line names each one's ending.
      get victory() {
        const sim = endSim('Radiator Weather');
        const tail = ' Conamara 可以重新展开散热板了。Ganymede (木卫三) 保住了它的水。';
        if (!sim) return '两艘管理局护卫舰都退出了战斗。' + tail;
        const a = sim.byId('isa1'), b = sim.byId('isa2');
        const head = a && b && a.disabled && b.disabled && !a.destroyed && !b.destroyed
          ? 'Tenacity 和 Vigil 都退出了战斗，正在失控漂流。'
          : endedShort(sim, 'isa1', 'Tenacity') + '. ' + endedShort(sim, 'isa2', 'Vigil') + '.';
        return head + tail;
      },
      // The station can be lost, or our two ships can be, with the station still on its stowed sink.
      get defeat() {
        const sim = endSim('Radiator Weather');
        const st = sim && sim.byId('conamara');
        if (st && !isOut(st) && ableShips(sim) === 0) {
          const live = ['isa1', 'isa2'].filter((id) => !isDone(sim.byId(id))).length;
          return 'Larkspur 和 Anselm 都在 Europa (木卫二) 上空退出了战斗。Conamara Station 的散热板还收着，热沉在 ' + pctOf(st.thermalLoad()) + '.' +
            (live ? ' ' + COUNT[live] + ' 艘管理局护卫舰还在上空。' : '');
        }
        return 'Conamara Station 没了，Ganymede (木卫三) 这一季的水也去了一半。';
      },
      build() {
        const body = B.europa;
        return {
          name: 'Radiator Weather', body, sunAngle: 2.6, playerFaction: 'JC',
          ships: [
            { id: 'larkspur', name: 'JCS Larkspur', cls: 'corvette', faction: 'JC', player: true, orbit: { altitude: km(2400), angle: -0.35 } },
            { id: 'anselm', name: 'JCS Anselm', cls: 'frigate', faction: 'JC', player: true, orbit: { altitude: km(2400), angle: -0.37 } },
            { id: 'conamara', name: 'Conamara Station', cls: 'station', faction: 'JC', orbit: { altitude: km(2400), angle: 0 }, heat: (OD.Ships.CLASSES.station || {}).sinkCapacity * 0.88, radiatorsOut: false, radiatorsAuto: false },
            { id: 'isa1', name: 'ISV Tenacity', cls: 'frigate', faction: 'ISA', ai: true, orbit: { altitude: km(2400), angle: 0.07 }, propFraction: 0.85 },
            { id: 'isa2', name: 'ISV Vigil', cls: 'frigate', faction: 'ISA', ai: true, orbit: { altitude: km(2700), angle: 0.1 }, propFraction: 0.85 },
          ],
          objectives: [
            { id: 'n', text: '使两艘管理局护卫舰失能', type: 'neutralize', targets: ['isa1', 'isa2'] },
            { id: 'p', text: 'Conamara Station 存活', type: 'protect', ship: 'conamara' },
          ],
          intro: [say('Conamara Station', '盟约的船，这里是 Conamara。你们一到，她们就会对我们开火。热沉已经到 88 %，所以散热板还能再收大约一小时。之后我们只能当着她们的光束展开。')],
          triggers: [
            hintAt({ time: 2 }, 'h1', touch() ? '这次你有两艘船，Larkspur 和 Anselm。在地图上点其中一艘来选中它。指令只发给选中的船，所以每艘要分别下令。' : '这次你有两艘船，Larkspur 和 Anselm。按 Tab 在两艘之间切换，Shift 点击可以把一艘加进选择，一条指令就发给两艘。', '#fleetList'),
            hintAt({ time: 20 }, 'h2', '热量区显示热沉在涨。散热板只有展开时才排热，所以没有炮火打来时就展开' + (touch() ? '' : ' with X') + '，光束够得着之前再收起来。', '#shipPanel'),
            hintAt((sim) => sim.time > 60 && hasAction(sim, 'aim_radiators') && hostileRadiatorsOut(sim, km(450)), 'h3', '那艘护卫舰把散热板展开了，好压住自己的热沉。按 T 把瞄准部位设成散热板。散热板是舰体上最薄的部分，护卫舰一旦丢了散热板，就得坐在自己的热里。', '#pEng'),
            { when: (sim) => sim.objectives[0].done, actions: [{ fn: (sim) => { const st = sim.byId('conamara'); if (st) { st.radiators.auto = true; st.radiators.deployed = true; } } }, { log: { speaker: 'Conamara Station', text: '散热板展开中。热沉已经开始下降。谢谢，盟约。' } }] },
          ],
        };
      },
    },
    {
      n: 4, id: 'slugs-in-the-dark', title: '黑暗中的弹丸', simName: 'Slugs in the Dark', location: 'Io (木卫一)，Loki 接近航线', date: '2211 年 5 月 3 日',
      brief: [
        '你在 Io (木卫一) 的 Loki 接近航线上，带着 Larkspur、Anselm 和新驱逐舰 JCS Bastion。管理局驱逐舰 ISV Coriolis 带着这里最重的线圈炮，这一周已经用它打过三艘盟约货船。其中一艘上有活人。',
        '弹丸不带制导。Coriolis 会朝“你保持航向就会到达的位置”开火，而在 300 公里上，4.5 公里/秒的弹丸要飞 67 秒。所以别保持航向。规避、花推进剂，靠近到自己的光束和 Bastion 能还手的距离。',
      ],
      comms: [say('JCS Bastion', '这里是 Bastion，跟着你们。她是一百八十米的驱逐舰，转得慢，所以走直线挨打。规避交给你们俩。')],
      // Coriolis ends this chapter adrift, wrecked, taken, or driven off past 1 500 km with her hull
      // opened up (sim.js drivenOffStep), and a hull that is still flying is not called adrift. Bastion
      // only took a hit in the endings where something got through her armour, so her sentence is read
      // off her hull.
      get victory() {
        const sim = endSim('Slugs in the Dark');
        const tail = ' Io (木卫一) 的接近航线打开了。';
        if (!sim) return 'Coriolis 退出了战斗。' + tail;
        return endedAs(sim, 'coriolis', 'Coriolis') + ' ' + ourEnd(sim.byId('bastion'), 'Bastion') + tail;
      },
      // Larkspur is out of the fight in every way this chapter is lost (she is the protect objective),
      // and Coriolis may be out of it as well.
      get defeat() {
        const sim = endSim('Slugs in the Dark');
        const c = sim && sim.byId('coriolis');
        if (!sim) return '任务编队被逐出 Loki 接近航线，Coriolis 仍然控制着 Io (木卫一) 的接近航线。';
        return 'Larkspur 在 Loki 接近航线上退出了战斗。' +
          (isDone(c) ? endedAs(sim, 'coriolis', 'Coriolis') + ' 盟约用一艘护卫艇换来了这条接近航线。'
            : 'Coriolis 仍然控制着 Io (木卫一) 的接近航线。');
      },
      build() {
        const body = B.io;
        return {
          name: 'Slugs in the Dark', body, sunAngle: -2.2, playerFaction: 'JC',
          ships: [
            { id: 'larkspur', name: 'JCS Larkspur', cls: 'corvette', faction: 'JC', player: true, orbit: { altitude: km(2600), angle: 0 } },
            { id: 'anselm', name: 'JCS Anselm', cls: 'frigate', faction: 'JC', player: true, orbit: { altitude: km(2600), angle: -0.02 } },
            { id: 'bastion', name: 'JCS Bastion', cls: 'destroyer', faction: 'JC', player: true, orbit: { altitude: km(2600), angle: -0.05 } },
            { id: 'coriolis', name: 'ISV Coriolis', cls: 'destroyer', faction: 'ISA', ai: true, orbit: { altitude: km(3100), angle: 0.2 }, propFraction: 0.9 },
            { id: 'isa2', name: 'ISV Lark', cls: 'corvette', faction: 'ISA', ai: true, orbit: { altitude: km(3300), angle: 0.24 }, propFraction: 0.9 },
          ],
          objectives: [
            { id: 'n', text: '使 ISV Coriolis 失能', type: 'neutralize', targets: ['coriolis'] },
            { id: 'n2', text: '使 ISV Lark 失能', type: 'neutralize', targets: ['isa2'], optional: true },
            { id: 'pl', text: 'JCS Larkspur 返航', type: 'protect', ship: 'larkspur' },
          ],
          intro: [say('JCS Bastion', '这里是 Bastion，跟着你们。她转得慢，所以走直线挨打。规避交给你们俩。')],
          triggers: [
            hintAt({ time: 2 }, 'h1', touch() ? 'Coriolis 会整天守在 600 公里，那个距离上你的光束几乎打不动她的装甲。给三艘船下同一条指令，一艘一艘来：点船、点 Coriolis、在距离框里输 200、点保持距离。然后她们就一起压住她。给 Larkspur 和 Anselm 打开规避，让她的弹丸落空。' : 'Coriolis 会整天守在 600 公里，那个距离上你的光束几乎打不动她的装甲。Shift 点击三艘船，点 Coriolis，距离框输 200，按保持距离，她们就一起压住她。按 J 给 Larkspur 和 Anselm 打开规避，让她的弹丸落空。', '#shipPanel'),
            hintAt({ time: 40 }, 'h2', 'Coriolis 朝你“将会在的位置”开火，不是现在的位置。按 P 看这个距离上的弹丸飞行时间。300 公里是 67 秒，这段时间里任何点火都会让你离开瞄准点。', '#btnPhysics'),
            hintAt((sim) => sim.time > 60 && trackQ(sim, 'coriolis') < 2.5, 'h2b', '我们对 Coriolis 有跟踪但没有解算，所以线圈炮没法打提前量。她的也一样。所以她很安静。拉近距离会让双方的图像都变清楚。主动传感器（S）能立刻拿到解算，同时也把我们的解算交给她。', '#shipPanel', (sim) => trackQ(sim, 'coriolis') >= 2.5 || sim.time > 500),
            hintAt((sim) => inbound(sim, 'slug'), 'h3', '弹丸来袭。地图上每一发都带到达时间，目标离开瞄准点后会显示“将落空”。面板顶部的威胁栏在数它们。规避（J）会花推进剂，在弹丸到达前把你挪开。', '#shipPanel'),
          ],
        };
      },
    },
    {
      n: 5, id: 'hard-burn', title: '全力点火', simName: 'Hard Burn', location: '深空，自 Io (木卫一) 出发', date: '2211 年 5 月 11 日',
      brief: [
        '你带着 JCS Larkspur 从 Io (木卫一) 出发，单独一艘。管理局的袭击舰 ISV Tamarind 今早袭击了货船 JCV Kestrel Moon，带着货跑了。她在一万公里外，正向外点火。越过 60 000 公里，你的推进剂买不到任何能追上她的转移。',
        'Larkspur 推进剂是满的，加速度和 Tamarind 一样。尾追意味着先匹配她的速度再超过，缩短距离，最后还要留着速度增量在并排时反推。最后那次反推大约要掉头烧四分钟，推进器正对着她。',
        'Kestrel Moon 先伤了她。Tamarind 的发射舱是空的，一半炮位哑了，舰体只剩 60 %。硬冲进去，狠狠反推，把这次交会压短。压着速度接近，只会让你在她的射程里滑行，而她直奔逃逸线。',
      ],
      comms: [say('Navigation', '她会一直跑到以为我们放弃为止。Tamarind 是护卫艇，推进剂只剩六成，她比我们更耗不起。')],
      // A wreck takes the cargo with her, so the cargo sentence is read off the hull it is aboard.
      get victory() {
        const sim = endSim('Hard Burn');
        const t = sim && sim.byId('tamarind');
        const tail = ' 管理局在这里少了一艘补不回来的袭击舰。';
        if (!t) return 'Tamarind 在逃逸线内退出了战斗。' + tail;
        if (t.destroyed) return 'Tamarind 在逃逸线内解体，Kestrel Moon 的货跟她一起没了。' + tail;
        if (t.captured) return 'Tamarind 在逃逸线内被登舰俘获。Kestrel Moon 的货还在她船上。' + tail;
        return 'Tamarind 在逃逸线内退出战斗，失控漂流，' + adriftWhy(t) + ' Kestrel Moon 的货还在她船上。' + tail;
      },
      // Either she crossed the line, or Larkspur is out of the fight with the raider still inside it.
      get defeat() {
        const sim = endSim('Hard Burn');
        const t = sim && sim.byId('tamarind');
        if (t && !isDone(t) && ableShips(sim) === 0) {
          return 'Larkspur 在深空退出战斗，这里没有我们别的船了。Tamarind 带着 Kestrel Moon 的货还在跑。';
        }
        return 'Tamarind 在 60 000 公里处越过了逃逸线，带着 Kestrel Moon 的货跑了。';
      },
      build() {
        return {
          name: 'Hard Burn', body: null, sunAngle: 1.0, playerFaction: 'JC',
          markers: [{ pos: { x: 0, y: 0 }, radius: km(60000), label: '逃逸线 60 000 公里', color: '#ff5d5d' }],
          ships: [
            { id: 'larkspur', name: 'JCS Larkspur', cls: 'corvette', faction: 'JC', player: true, crew: { xp: 2 }, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, heading: 0.3 },
            { id: 'tamarind', name: 'ISV Tamarind', cls: 'corvette', faction: 'ISA', ai: true, behaviour: 'flee', reserveDv: 27000, pos: { x: km(7200), y: km(3000) }, vel: { x: 2000, y: 900 }, heading: 0.4, propFraction: 0.6, hull: 0.6, systems: { weapons: 0.5, sensors: 0.8 }, noMounts: ['launcher'] },
          ],
          objectives: [
            { id: 'n', text: '在 ISV Tamarind 越过逃逸线前使她失能', type: 'neutralize', targets: ['tamarind'] },
            { id: 'esc', text: 'ISV Tamarind 留在 60 000 公里内', type: 'escapeFail', ship: 'tamarind', point: { x: 0, y: 0 }, range: km(60000), hidden: true },
          ],
          intro: [say('Navigation', '她会一直跑到以为我们放弃为止。Tamarind 是护卫艇，推进剂只剩六成，她比我们更耗不起。')],
          triggers: [
            hintAt({ time: 2 }, 'h1', 'Tamarind 在跑，每一分钟都在拉开距离。锁定她，看转移估算，马上按拦截。巡航保持“最快”，压着速度接近只会让你在她的射程里滑行，而她直奔逃逸线。', '#shipPanel'),
            { when: (sim) => { const t = sim.byId('tamarind'); return t && t.deltaV() < 27500 && !sim.flags.tamCoast; }, actions: [{ flag: 'tamCoast' }, { log: { speaker: 'Navigation', text: 'Tamarind 关了推进器。她靠现有速度滑行，把剩下的推进剂留着。匹配那个速度再超过，最后狠狠反推。' } }] },
          ],
        };
      },
    },
    {
      n: 6, id: 'europa-line', title: '欧罗巴防线', simName: 'The Europa Line', location: 'Europa (木卫二) 轨道', date: '2211 年 5 月 30 日',
      brief: [
        '你带着 Larkspur、Anselm 和 Bastion 回到 Europa (木卫二) 上空，在 Conamara Station 前守着防线。管理局放弃围困了。两艘枪骑兵级母舰正在靠近，还有一艘护卫舰护航。',
        '枪骑兵级从不靠近到光束射程。她带二十四枚拦截弹，在大约 2 500 公里外放出去就走。拦截弹是一种自带速度增量的小型飞行器。点防御可以打掉它，船可以跑一阵子，而打掉母舰就不会再有新的来。',
        'Bastion、Anselm 和 Larkspur 就是这条防线。什么都别想碰到空间站。',
      ],
      comms: [say('JCS Bastion', '点防御能应付几枚，应付不了齐射。在她们发射前赶到母舰那里。')],
      // A Lancer killed while she is still loaded does not have empty bays, so the interceptors left are
      // counted off her mounts, and the station's radiators are read off the station.
      get victory() {
        const sim = endSim('The Europa Line');
        if (!sim) return '两艘枪骑兵级都退出了战斗，没有任何东西碰到 Conamara Station。';
        const st = sim.byId('conamara');
        const left = baysLeft(sim.byId('l1')) + baysLeft(sim.byId('l2'));
        const bays = left ? left + (left === 1 ? ' 枚拦截弹还在发射舱里。' : ' 枚拦截弹还在发射舱里。') + ' 还在发射舱里。' : '她们的发射舱已经空了。';
        const rad = st && st.radiators && st.radiators.state > 0.9 ? 'Conamara 的散热板还展开着。'
          : 'Conamara 的散热板收着，热沉在 ' + pctOf(st ? st.thermalLoad() : 0) + '.';
        return endedShort(sim, 'l1', 'Ardent') + '. ' + endedShort(sim, 'l2', 'Fervent') + '. ' + bays + ' ' + rad;
      },
      // The station can be lost, or the line in front of it can be, with the station still on the air.
      get defeat() {
        const sim = endSim('The Europa Line');
        const st = sim && sim.byId('conamara');
        if (st && !isOut(st) && ableShips(sim) === 0) {
          const live = sim.ships.filter((s) => s.faction !== sim.playerFaction && s.role !== 'station' && !isDone(s)).length;
          return 'Larkspur、Anselm 和 Bastion 在 Conamara Station 前退出了战斗。空间站还在发信。' +
            (live ? ' ' + COUNT[live] + ' 艘管理局舰船还在上空。' : '');
        }
        return 'Conamara Station 停止发信了。';
      },
      build() {
        const body = B.europa;
        return {
          name: 'The Europa Line', body, sunAngle: 0.2, playerFaction: 'JC',
          ships: [
            { id: 'conamara', name: 'Conamara Station', cls: 'station', faction: 'JC', orbit: { altitude: km(2400), angle: 0 }, ai: true },
            { id: 'larkspur', name: 'JCS Larkspur', cls: 'corvette', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: km(2400), angle: 0.03 } },
            { id: 'anselm', name: 'JCS Anselm', cls: 'frigate', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: km(2400), angle: 0.05 } },
            { id: 'bastion', name: 'JCS Bastion', cls: 'destroyer', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: km(2400), angle: 0.07 } },
            { id: 'l1', name: 'ISV Ardent', cls: 'lancer', faction: 'ISA', ai: true, orbit: { altitude: km(6000), angle: 0.55 }, propFraction: 0.9 },
            { id: 'l2', name: 'ISV Fervent', cls: 'lancer', faction: 'ISA', ai: true, orbit: { altitude: km(6300), angle: 0.6 }, propFraction: 0.9 },
            { id: 'f1', name: 'ISV Tenacity', cls: 'frigate', faction: 'ISA', ai: true, orbit: { altitude: km(5800), angle: 0.5 }, propFraction: 0.8 },
          ],
          objectives: [
            { id: 'p', text: 'Conamara Station 存活', type: 'protect', ship: 'conamara' },
            { id: 'n', text: '使所有管理局舰船失能', type: 'neutralize', targets: 'hostiles' },
          ],
          intro: [say('JCS Bastion', '点防御能应付几枚，应付不了齐射。在她们发射前赶到母舰那里。')],
          triggers: [
            hintAt({ time: 2 }, 'h1', '枪骑兵级会守在 2 500 公里左右，发射舱一空就走。趁她们还满载，马上派 Larkspur 追上去。Bastion 可以留在空间站这边。', '#fleetList'),
            hintAt((sim) => inbound(sim, 'interceptor'), 'h2', '拦截弹来袭，地图上画成红色，带倒计时，还有一个朝目标收拢的圈。威胁栏会说点防御来不来得及拦，青色圈是点防御的射程。如果热沉扛得住，在它们到达前按 X 收起散热板。', '#shipPanel'),
            hintAt((sim) => sim.time > 20 && hasAction(sim, 'launch2'), 'h3', '发射舱在战斗中不会补充。目标进入蓝色发射圈后，按 2、4，或者用 L、Shift+L、A 全部发射。对方的点防御每分钟在红圈内拦掉几枚，每个键下面那行会写有几枚能穿过去，所以一次要放够。', '#pEng'),
          ],
        };
      },
    },
    {
      n: 7, id: 'harkness', title: 'Harkness', simName: 'Harkness', location: 'Jupiter (木星) 轨道，高度 400 000 公里', date: '2211 年 6 月 21 日',
      brief: [
        '你在木星高轨道，离行星 400 000 公里，一支管理局分舰队在这里就位，要把各卫星彼此隔断。两艘驱逐舰、两艘护卫舰、两艘护卫艇。指挥部把任务编队和巡洋舰 JCS Harkness 交给你去打破它。',
        'Harkness 是盟约唯一的主力舰。四门主激光，反射镜口径 1.6 米，舰首装甲 70 厘米。《宣言》签署以来她没出过船坞，因为盟约补不起第二艘。而失去卫星之间的航线，代价更大。带她出去，再带她回来。',
      ],
      comms: [say('JCS Harkness', '今天 Harkness 归你指挥。她的四门主激光能在比对方任何武器都远的距离上烧穿装甲，所以守住那个距离。舰首 70 厘米，舰尾 12 厘米。别让驱逐舰绕到她背后。')],
      // Armour does not ablate, so what Harkness came home with is her hull integrity, and a hull that
      // broke off and ran is counted as one that ran, not as a wreck.
      get victory() {
        const sim = endSim('Harkness');
        const tail = ' 各卫星之间又能互相通话了。';
        if (!sim) return '分舰队被打散，Harkness 正在返回 Callisto (木卫四)。' + tail;
        const h = sim.byId('harkness');
        const ran = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].filter((id) => { const s = sim.byId(id); return s && s.drivenOff && !isOut(s); }).length;
        const hark = h && h.hull < 0.995 ? ' Harkness 正以 ' + pctOf(h.hull) + ' 的舰体完整度返回 Callisto (木卫四)。'
          : ' Harkness 正在返回 Callisto (木卫四)，装甲没有被击穿。';
        return '分舰队被打散。' + (ran ? ' ' + COUNT[ran] + ' 艘（共六艘）脱离，跑到一千五百公里外。' : '') + hark + tail;
      },
      // Harkness is the protect objective, so this chapter is only lost with her out of the fight.
      get defeat() {
        const sim = endSim('Harkness');
        const h = sim && sim.byId('harkness');
        const tail = ' 盟约没有第二艘巡洋舰，这里也没有能造巡洋舰的船坞。';
        if (h && h.captured) return 'Harkness 在木星高轨道被登舰俘获。' + tail;
        if (h && h.disabled && !h.destroyed) return 'Harkness 在木星高轨道失控漂流，舰体完整度 ' + pctOf(h.hull) + '，分舰队还在她周围。' + tail;
        return 'Harkness 没了。' + tail;
      },
      build() {
        const body = B.jupiter;
        const alt = km(400000);
        return {
          name: 'Harkness', body, sunAngle: -1.4, playerFaction: 'JC',
          ships: [
            { id: 'harkness', name: 'JCS Harkness', cls: 'cruiser', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: alt, angle: 0 } },
            { id: 'bastion', name: 'JCS Bastion', cls: 'destroyer', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: alt, angle: 0.0006 } },
            { id: 'anselm', name: 'JCS Anselm', cls: 'frigate', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: alt, angle: -0.0006 } },
            { id: 'larkspur', name: 'JCS Larkspur', cls: 'corvette', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: alt, angle: 0.0012 } },
            { id: 'e1', name: 'ISV Coriolis', cls: 'destroyer', faction: 'ISA', ai: true, orbit: { altitude: alt + km(900), angle: 0.004 }, propFraction: 0.9 },
            { id: 'e2', name: 'ISV Meridian', cls: 'destroyer', faction: 'ISA', ai: true, orbit: { altitude: alt + km(1100), angle: 0.0046 }, propFraction: 0.9 },
            { id: 'e3', name: 'ISV Tenacity', cls: 'frigate', faction: 'ISA', ai: true, orbit: { altitude: alt + km(700), angle: 0.0052 }, propFraction: 0.85 },
            { id: 'e4', name: 'ISV Vigil', cls: 'frigate', faction: 'ISA', ai: true, orbit: { altitude: alt + km(1300), angle: 0.0034 }, propFraction: 0.85 },
            { id: 'e5', name: 'ISV Sabre', cls: 'corvette', faction: 'ISA', ai: true, orbit: { altitude: alt + km(600), angle: 0.006 }, propFraction: 0.9 },
            { id: 'e6', name: 'ISV Lark', cls: 'corvette', faction: 'ISA', ai: true, orbit: { altitude: alt + km(1500), angle: 0.0062 }, propFraction: 0.9 },
          ],
          objectives: [
            { id: 'n', text: '使管理局分舰队失能', type: 'neutralize', targets: 'hostiles' },
            { id: 'p', text: 'JCS Harkness 存活', type: 'protect', ship: 'harkness' },
          ],
          intro: [say('JCS Harkness', '今天 Harkness 归你指挥。她的四门主激光能在比对方任何武器都远的距离上烧穿装甲，所以守住那个距离。别让驱逐舰绕到她背后。')],
          triggers: [
            hintAt((sim) => sim.time > 45 && !!(E() && E().reach), 'h3', '到目标那条线上的刻度就是烧穿距离。青色刻度是 Harkness 的光束烧穿当前瞄准装甲的距离，红色是对方烧穿她的距离。把距离守在两者之间，就只有一方在造成伤害。', '#shipPanel'),
            hintAt({ time: 2 }, 'h1', (touch() ? '四艘对六艘，别把兵力散开。给四艘下同一条指令，一艘一艘来：点船、在距离框里输 300、' : '四艘对六艘，别把兵力散开。在列表里 Shift 点击四艘，距离框输 300、') + ' 把所有光束集中打最近的管理局舰，打出去再换下一艘。Harkness 保持舰首对敌，舰首 70 厘米，舷侧只有 28 厘米。', '#fleetList'),
          ],
        };
      },
    },
    {
      n: 8, id: 'declaration', title: '《宣言》', simName: 'Declaration', location: 'Amalthea (木卫五) 轨道之外，高度 181 000 公里', date: '2211 年 7 月 9 日',
      brief: [
        '你在木星上方 181 000 公里，Amalthea (木卫五) 轨道之外 70 000 公里，带着 Harkness、驱逐舰 Bastion 和 Marrow、Anselm 和 Larkspur。管理局旗舰 ISV Concordance 从 Amalthea 的锚地出来了，带着她分舰队剩下的全部。一艘驱逐舰、两艘护卫舰、两艘枪骑兵级。',
        '她的上将正式要求盟约撤回《宣言》。Callisto (木卫四) 的回答是把这个任务编队的位置发过去。Concordance 是按 Harkness 同一套图纸造的巡洋舰。同样四门主激光、同样 70 厘米舰首、同样大的热沉。她的光束在和你一样的距离上烧穿装甲，热沉装的热也和你一样多。',
        '使 Concordance 失能。她分舰队剩下的，打不打随你，盟约希望 Harkness 完整地回来。',
      ],
      comms: [say('JCS Harkness', '如果 Concordance 被打掉，管理局在这里就什么都不剩了。慢慢来。')],
      // Nothing in the sim strikes her colours, so the line says how she actually left the fight.
      get victory() {
        const sim = endSim('Declaration');
        const tail = ' 管理局在这里剩下的都在往内星系烧。《宣言》站住了。';
        if (!sim) return 'Concordance 退出了战斗。' + tail;
        return endedAs(sim, 'concordance', 'Concordance') + tail;
      },
      // Harkness is the protect objective, so this chapter is only lost with her out of the fight.
      get defeat() {
        const sim = endSim('Declaration');
        const h = sim && sim.byId('harkness');
        const tail = ' 《宣言》到秋天就会被撤回。';
        if (h && h.captured) return '在 Amalthea (木卫五) 外，Harkness 被登舰俘获，盟约再没有东西能把管理局挡在木星轨道之外。' + tail;
        if (h && h.disabled && !h.destroyed) return 'Harkness 在 Amalthea (木卫五) 外失控漂流，舰体完整度 ' + pctOf(h.hull) + '，盟约再没有东西能把管理局挡在木星轨道之外。' + tail;
        return 'Harkness 没了，盟约再没有东西能把管理局挡在木星轨道之外。' + tail;
      },
      build() {
        const body = B.jupiter;
        const alt = km(181000);
        return {
          name: 'Declaration', body, sunAngle: 0.9, playerFaction: 'JC',
          ships: [
            { id: 'harkness', name: 'JCS Harkness', cls: 'cruiser', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: alt, angle: 0 } },
            { id: 'bastion', name: 'JCS Bastion', cls: 'destroyer', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: alt, angle: 0.0012 } },
            { id: 'marrow', name: 'JCS Marrow', cls: 'destroyer', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: alt, angle: -0.0012 } },
            { id: 'anselm', name: 'JCS Anselm', cls: 'frigate', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: alt, angle: 0.0024 } },
            { id: 'larkspur', name: 'JCS Larkspur', cls: 'corvette', faction: 'JC', player: true, crew: { xp: 2 }, orbit: { altitude: alt, angle: -0.0024 } },
            { id: 'concordance', name: 'ISV Concordance', cls: 'cruiser', faction: 'ISA', ai: true, orbit: { altitude: alt + km(1500), angle: 0.012 }, propFraction: 0.85 },
            { id: 'e1', name: 'ISV Meridian', cls: 'destroyer', faction: 'ISA', ai: true, orbit: { altitude: alt + km(1200), angle: 0.0135 }, propFraction: 0.85 },
            { id: 'e2', name: 'ISV Tenacity', cls: 'frigate', faction: 'ISA', ai: true, orbit: { altitude: alt + km(1900), angle: 0.011 }, propFraction: 0.8 },
            { id: 'e3', name: 'ISV Vigil', cls: 'frigate', faction: 'ISA', ai: true, orbit: { altitude: alt + km(2100), angle: 0.0145 }, propFraction: 0.8 },
            { id: 'e4', name: 'ISV Ardent', cls: 'lancer', faction: 'ISA', ai: true, orbit: { altitude: alt + km(4000), angle: 0.016 }, propFraction: 0.9 },
            { id: 'e5', name: 'ISV Fervent', cls: 'lancer', faction: 'ISA', ai: true, orbit: { altitude: alt + km(4200), angle: 0.009 }, propFraction: 0.9 },
          ],
          objectives: [
            { id: 'n', text: '使 ISV Concordance 失能', type: 'neutralize', targets: ['concordance'] },
            { id: 'p', text: 'JCS Harkness 存活', type: 'protect', ship: 'harkness' },
            { id: 'all', text: '使每一艘管理局舰船失能', type: 'neutralize', targets: 'hostiles', optional: true },
          ],
          intro: [say('JCS Harkness', '如果 Concordance 被打掉，管理局在这里就什么都不剩了。慢慢来。')],
          triggers: [
            hintAt({ time: 2 }, 'h1', (touch() ? 'Concordance 舰首有 70 厘米装甲，800 公里外的光束烧不穿。给每艘船下同一条指令，一艘一艘来：点船、距离框输 300、' : 'Concordance 舰首有 70 厘米装甲，800 公里外的光束烧不穿。Shift 点击整支舰队，距离框输 300、') + ' 先打最近的护航舰，然后把所有光束集中在 Concordance 上。', '#fleetList'),
          ],
        };
      },
    },
  ];

  // ---------------------------------------------------------------- the war, in plain words
  // Shown on the bridge console's `situation` screen before chapter 1, from the chapters screen and from the
  // pause screen during a story chapter. Three short paragraphs: who you are, who you are fighting, what is at
  // stake. main.js renders them as the screen's paragraphs.
  const situation = [
    '你是木星盟约的指挥官 Halvorsen，护卫艇 JCS Larkspur 就是你的船。',
    '2211 年 3 月，木星的卫星签署了《宣言》，脱离内星系管理局。管理局一直把这里当关税区，对运进来的货征税，还规定她们冰块的价格。',
    '管理局要把这笔收入拿回去。它先是以检查为名拦停盟约的船，现在变成了封锁。封锁一旦成立，各卫星之间就没法互相贸易，也买不到只有内星系才造的反应堆和零件。',
  ];

  // The two sides, for the same screen. One line each, in the player's terms.
  const sides = [
    { faction: 'JC', name: '木星盟约', text: '你们。Callisto (木卫四)、Ganymede (木卫三)、Europa (木卫二) 和 Io (木卫一)，一艘巡洋舰加几艘护航舰。你们要让《宣言》站住。' },
    { faction: 'ISA', name: '内星系管理局', text: '他们。地球和火星，在这里摆了几十艘舰的一个分舰队。他们要把关税收入拿回来。' },
  ];

  // What one chapter's result changed for the war: one sentence per chapter and outcome.
  const WAR = {
    1: {
      victory: 'Long Meridian 回到了 Valhalla Station (瓦尔哈拉站)，盟约还留着那艘运推进剂的油轮。',
      defeat: 'Long Meridian 坠毁在 Callisto (木卫四)，盟约少了一艘运自己推进剂的油轮。',
      // the other way to lose it: the escort is gone and the tanker is still falling
      larkspur: 'Larkspur 在 Callisto (木卫四) 上空损失，盟约少了一艘护卫艇，也少了运推进剂的油轮。',
    },
    2: {
      victory: '船队通过了，盟约第一次向管理局军舰开火。',
      prize: '船队通过了，Sabre 被俘获，这是盟约第一次登上管理局军舰。',
      // she broke off and ran instead: hurt, but still the Authority's
      driven: '船队通过了，Sabre 跑回去修，管理局这周在 Ganymede (木卫三) 没有警戒舰。',
      defeat: '船队没了，管理局可以对内行星说，它的检查拦住了一次盟约袭击。',
      // the other way to lose it: the escort is gone and the convoy is still out there
      larkspur: '盟约在 Ganymede (木卫三) 上空少了一艘护卫艇，管理局的 Sabre 还在船队航线上。',
    },
    3: {
      victory: 'Conamara Station 的散热板又展开了，Ganymede (木卫三) 还在从 Europa (木卫二) 拿到水。',
      defeat: 'Conamara Station 没了，半个 Ganymede (木卫三) 开始配给供水。',
      // the station held and the ships in front of it did not
      ships: 'Conamara Station 还收着散热板压在管理局炮口下，盟约在 Europa (木卫二) 上空已经没有船了。',
    },
    4: {
      victory: 'Io (木卫一) 的接近航线打开了，管理局驱逐舰不再朝保持直线航行的货船开火。',
      // driven off rather than wrecked: she is flying, and she will be back when her yard is done with her
      driven: 'Coriolis 带伤脱离，离开了 Loki 接近航线，盟约货船可以用到它修好为止。',
      defeat: 'Coriolis 仍然控制着 Io (木卫一) 的接近航线，盟约货船只能绕远路。',
      // Coriolis is out of it too, and Larkspur did not come home
      coriolis: 'Coriolis 在 Io (木卫一) 外退出战斗，盟约用 Larkspur 换来了 Loki 接近航线。',
    },
    5: {
      victory: 'Tamarind 在逃逸线内被截住，管理局的袭击舰以后都得假设盟约会追出来。',
      defeat: 'Tamarind got away with Kestrel Moon\' 的货，管理局正在装备更多袭击舰。',
      // the chase ended with Larkspur out of the fight and the raider still inside the line
      larkspur: 'Larkspur 在深空退出战斗，Tamarind 还带着 Kestrel Moon 的货。',
    },
    6: {
      victory: 'Conamara 还在防线后面发信，管理局已经没有便宜的办法打掉它。',
      defeat: 'Conamara Station is off the air, and Europa\' 的冰，盟约够不着了。',
      // the station held and the line in front of it did not
      ships: 'Conamara 前的防线没了，盟约这个月没法再摆一条。',
    },
    7: {
      victory: '木星高轨的分舰队被打散，各卫星之间又能互相补给。',
      defeat: 'Harkness 没了，盟约没有主力舰，也过不去分舰队那一关。',
      // adrift is not the same as gone: she is a hull the Authority now has to decide what to do with
      adrift: 'Harkness 在木星高轨失控漂流，盟约过不去分舰队去救她。',
    },
    8: {
      victory: 'Concordance is out of the fight, the Authority\' 的舰船回内星系了，《宣言》站住了。',
      defeat: 'Harkness 和任务编队一起没了，盟约再没有东西保卫《宣言》。',
      adrift: 'Harkness 在 Amalthea (木卫五) 外失控漂流，盟约再没有东西保卫《宣言》。',
    },
  };
  // warSoFar(n, outcome) -> one sentence, or '' when the chapter or the outcome is unknown.
  function warSoFar(n, outcome) {
    const row = WAR[n];
    if (!row) return '';
    const win = outcome === 'victory';
    // The fight this line is about, when it is still there to read. Every alternate row below needs one
    // fact off it to be true, so with no sim the chapter's plain row is what prints.
    const sim = endSim((chapters[n - 1] || {}).simName);
    const foe = (id) => (sim ? sim.byId(id) : null);
    // Chapter 1: the tanker on the surface, or the escort gone with the tanker still falling.
    if (n === 1 && !win) { const m = foe('meridian'); if (m && !m.destroyed && isOut(foe('larkspur'))) return row.larkspur; }
    // Chapter 2 has three wins: Sabre adrift, Sabre taken, or Sabre driven off the convoy route.
    if (n === 2 && win) {
      const s = foe('sabre');
      if (s && s.captured) return row.prize;
      if (s && s.drivenOff && !isOut(s)) return row.driven;
    }
    // And two losses: the convoy, or the escort. The debrief body is picked the same way.
    if (n === 2 && !win && ch2Loss() === 'larkspur') return row.larkspur;
    // Chapter 3: the station held and our ships did not.
    if (n === 3 && !win) { const st = foe('conamara'); if (st && !isOut(st) && ableShips(sim) === 0) return row.ships; }
    // Chapter 4: driven off is not wrecked, and a loss with Coriolis out of it cost us Larkspur.
    if (n === 4 && win) { const c = foe('coriolis'); if (c && c.drivenOff && !isOut(c)) return row.driven; }
    if (n === 4 && !win) { const c = foe('coriolis'); if (isDone(c)) return row.coriolis; }
    // Chapter 5: the raider is still inside the line and we have nothing left to chase her with.
    if (n === 5 && !win) { const t = foe('tamarind'); if (t && !isDone(t) && ableShips(sim) === 0) return row.larkspur; }
    // Chapter 6: the station is still on the air and the line in front of it is gone.
    if (n === 6 && !win) { const st = foe('conamara'); if (st && !isOut(st) && ableShips(sim) === 0) return row.ships; }
    // Chapters 7 and 8: Harkness adrift is a hull that still exists.
    if ((n === 7 || n === 8) && !win) { const h = foe('harkness'); if (h && h.disabled && !h.destroyed && !h.captured) return row.adrift; }
    return row[win ? 'victory' : 'defeat'] || '';
  }

  OD.Story = { chapters, situation, sides, warSoFar };
})();
