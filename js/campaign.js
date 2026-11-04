/* Orbital Declaration — Jovian campaign: eleven nodes, a persistent fleet, turns. */
(function () {
  'use strict';
  const OD = window.OD;
  const U = OD.U, P = OD.P;
  const km = (v) => v * 1000;
  const SAVE = 'od.campaign';

  // Map positions are schematic (Jupiter at the centre, distances compressed). They are read only to draw the map
  // and to find the node under a click: every transfer cost is in EDGES. No route passes under a node it does not
  // join: Metis sits off the Europa–Io route and Depot L5 off the Callisto–Ganymede route, at both map sizes.
  const NODES = [
    { id: 'callisto', name: 'Callisto (木卫四) · Valhalla Station (瓦尔哈拉站)', kind: 'port', body: 'callisto', x: 0.90, y: 0.78, owner: 'JC', desc: '盟约首都兼母港。可以补满推进剂并完成修理。它一旦失守，战争就结束了。' },
    { id: 'ganymede', name: 'Ganymede (木卫三) · Galileo Regio (伽利略区) 船坞', kind: 'yard', body: 'ganymede', x: 0.72, y: 0.30, owner: 'JC', desc: '盟约的船坞。新舰在这里下水服役。' },
    { id: 'europa', name: 'Europa (木卫二) · Conamara Station (科纳马拉站)', kind: 'station', body: 'europa', x: 0.42, y: 0.20, owner: 'JC', desc: '冰场兼补给站。两门 20 兆瓦的空间站激光守着它。' },
    { id: 'io', name: 'Io (木卫一) · Loki 铸造厂', kind: 'base', body: 'io', x: 0.30, y: 0.62, owner: 'ISA', desc: '管理局的落脚点。同时守住 Io 和 Amalthea，战争就赢了。' },
    { id: 'amalthea', name: 'Amalthea (木卫五) · 前进锚地', kind: 'base', body: 'jupiter', x: 0.55, y: 0.50, owner: 'ISA', desc: '管理局在木星低轨的前进基地。把它和 Io 一起守住，战争就赢了。' },
    { id: 'thebe', name: 'Thebe (木卫十四) 船坞', kind: 'yard', body: 'jupiter', x: 0.56, y: 0.66, owner: 'ISA', desc: '管理局夺下的一座盟约船坞。夺回来就多一条船台，每回合还有 22 点征用点。' },
    { id: 'metis', name: 'Metis (木卫十六) 环带精炼厂', kind: 'depot', body: 'jupiter', x: 0.44, y: 0.35, owner: 'none', desc: '从 Jupiter (木星) 的环带采出的推进剂。谁占着它就能在这里补给，每回合还有 6 点征用点。' },
    { id: 'anvil', name: 'Anvil 高轨空间站', kind: 'station', body: 'jupiter', x: 0.58, y: 0.14, owner: 'none', desc: '木星高轨的中立空间站。谁拿下它，每回合进账 12 点征用点。' },
    { id: 'himalia', name: 'Himalia (木卫六) 警戒站', kind: 'depot', body: null, x: 0.14, y: 0.20, owner: 'ISA', desc: '外围补给站。管理局的增援从这里进入木星系。' },
    { id: 'l4', name: 'Depot L4', kind: 'depot', body: null, x: 0.20, y: 0.86, owner: 'none', desc: 'Ganymede (木卫三) 与木星之间 L4 点的无人推进剂补给站。' },
    { id: 'l5', name: 'Depot L5', kind: 'depot', body: null, x: 0.87, y: 0.50, owner: 'none', desc: 'L5 点的无人推进剂补给站。' },
  ];
  const EDGES = [
    ['callisto', 'ganymede', 3.2], ['callisto', 'l5', 2.1], ['callisto', 'thebe', 4.6], ['callisto', 'l4', 3.8],
    ['ganymede', 'europa', 2.8], ['ganymede', 'anvil', 2.4], ['ganymede', 'l5', 2.0], ['ganymede', 'thebe', 3.5],
    ['europa', 'metis', 2.6], ['europa', 'anvil', 2.2], ['europa', 'io', 2.4], ['europa', 'himalia', 4.4],
    ['io', 'amalthea', 2.0], ['io', 'metis', 1.8], ['io', 'l4', 3.4], ['io', 'himalia', 4.9],
    ['amalthea', 'thebe', 1.6], ['amalthea', 'metis', 1.5], ['amalthea', 'anvil', 2.9],
    ['thebe', 'l5', 3.1], ['thebe', 'l4', 3.9], ['metis', 'anvil', 2.7], ['l4', 'himalia', 5.2],
  ];
  const GARRISONS = {
    io: ['destroyer', 'frigate', 'corvette', 'corvette'], amalthea: ['cruiser', 'destroyer', 'frigate', 'lancer'], thebe: ['frigate', 'corvette'],
    himalia: ['frigate', 'lancer', 'corvette'], metis: [], anvil: [], l4: [], l5: [],
  };
  const COST = { corvette: 40, frigate: 70, destroyer: 120, lancer: 55, cruiser: 260 };
  // Configurator designs are priced by dry mass on the same curve as the stock hulls.
  const costOf = (cls) => {
    if (COST[cls]) return COST[cls];
    const d = OD.Ships.CLASSES[cls] || {};
    if (OD.Configurator && typeof OD.Configurator.cost === 'function') { try { const c = OD.Configurator.cost(d); if (isFinite(c) && c > 0) return Math.round(c); } catch (e) { /* fall through */ } }
    return Math.round((40 * Math.pow(d.dryMass / 900e3 || 1, 0.68)) / 5) * 5;
  };
  const yardList = () => ['corvette', 'frigate', 'destroyer', 'lancer'].concat(Object.keys(OD.Ships.CLASSES).filter((k) => OD.Ships.CLASSES[k].custom));
  const INCOME = { port: 18, yard: 22, station: 12, depot: 6, base: 10 };
  const JC_NAMES = ['Tallow', 'Greylag', 'Ferrous', 'Halcyon', 'Ninefold', 'Sable', 'Wren', 'Orrery', 'Cinder', 'Vesper'];

  function newState() {
    const nodes = {};
    for (const n of NODES) nodes[n.id] = { owner: n.owner, garrison: (GARRISONS[n.id] || []).slice() };
    return {
      turn: 1, rp: 60, fleetAt: 'callisto', nameIdx: 0,
      nodes,
      fleet: [
        { id: 'c_larkspur', name: 'JCS Larkspur', cls: 'corvette', propFraction: 1, hull: 1, systems: { drive: 1, radiators: 1, sensors: 1, weapons: 1 } },
        { id: 'c_anselm', name: 'JCS Anselm', cls: 'frigate', propFraction: 1, hull: 1, systems: { drive: 1, radiators: 1, sensors: 1, weapons: 1 } },
      ],
      log: ['第 1 回合。舰队在 Callisto (木卫四)。拿下 Io (木卫一) 和 Amalthea (木卫五)。守住 Callisto。'],
      outcome: null,
    };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE) || 'null');
      if (!s || !s.nodes) return null;
      // a design deleted in the configurator cannot be flown; its ships are struck off rather than crashing the map
      if (s.fleet) s.fleet = s.fleet.filter((f) => OD.Ships.CLASSES[f.cls]);
      return s;
    } catch (e) { return null; }
  }
  function save(state) { try { localStorage.setItem(SAVE, JSON.stringify(state)); } catch (e) { /* per-viewer only */ } }
  function clear() { try { localStorage.removeItem(SAVE); } catch (e) { /* ignore */ } }

  const node = (id) => NODES.find((n) => n.id === id);
  function neighbours(id) { return EDGES.filter((e) => e[0] === id || e[1] === id).map((e) => ({ id: e[0] === id ? e[1] : e[0], dv: e[2] })); }
  function edgeDv(a, b) { const e = EDGES.find((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)); return e ? e[2] : null; }
  function shipDv(s) { const c = OD.Ships.CLASSES[s.cls]; return P.tsiolkovsky(c.exhaustVelocity, c.dryMass + c.propMass * s.propFraction, c.dryMass); }
  function canMove(state, to) {
    const dv = edgeDv(state.fleetAt, to);
    if (dv == null) return { ok: false, why: '不相邻。' };
    const short = state.fleet.filter((s) => shipDv(s) < km(dv) + 6000);
    if (short.length) return { ok: false, why: short[0].name + ' 只剩 ' + U.fmt.dv(shipDv(short[0])) + '。这次转移要花 ' + dv.toFixed(1) + ' 公里/秒，而每艘船都要留 6 公里/秒用来打仗。' };
    return { ok: true, dv };
  }
  function spendDv(s, dvms) {
    const c = OD.Ships.CLASSES[s.cls];
    const m0 = c.dryMass + c.propMass * s.propFraction;
    const used = P.propellantForDv(c.exhaustVelocity, m0, dvms);
    s.propFraction = Math.max(0, (c.propMass * s.propFraction - used) / c.propMass);
  }
  function move(state, to) {
    const r = canMove(state, to);
    if (!r.ok) return r;
    for (const s of state.fleet) spendDv(s, km(r.dv));
    state.fleetAt = to;
    state.log.push('第 ' + state.turn + ' 回合。舰队转移到 ' + node(to).name + '，花掉 ' + r.dv.toFixed(1) + ' 公里/秒。');
    return r;
  }
  function battleHere(state) { const n = state.nodes[state.fleetAt]; return n.owner !== 'JC' && n.garrison.length > 0; }
  function resupply(state) {
    const n = state.nodes[state.fleetAt], def = node(state.fleetAt);
    if (n.owner !== 'JC') return false;
    let did = false;
    for (const s of state.fleet) {
      if (s.propFraction < 1) { s.propFraction = 1; did = true; }
      // The wounded come back to fit in full at a port or yard, half elsewhere; the lost stay lost (v13).
      if (s.crew && OD.Crew && typeof OD.Crew.recover === 'function') { if (OD.Crew.recover(s.crew, def.kind === 'port' || def.kind === 'yard')) did = true; }
      if (def.kind === 'port' || def.kind === 'yard') {
        if (s.hull < 1) { s.hull = Math.min(1, s.hull + 0.4); did = true; }
        // The yard patches the parts and the aggregates follow; an old save has only the aggregates.
        if (OD.Damage && OD.Damage.repair && s.components && s.components.length) { if (OD.Damage.repair(s, 0.5)) did = true; }
        else for (const k in s.systems) if (s.systems[k] < 1) { s.systems[k] = Math.min(1, s.systems[k] + 0.5); did = true; }
      }
    }
    return did;
  }
  function buy(state, cls) {
    const def = node(state.fleetAt);
    if (def.kind !== 'yard' && def.kind !== 'port') return '舰船只能在船坞和 Callisto (木卫四) 下单建造。';
    if (state.nodes[state.fleetAt].owner !== 'JC') return '这里不是我们的。';
    if (state.rp < costOf(cls)) return '这型舰体要花 ' + costOf(cls) + ' 点征用点。你只有 ' + state.rp + ' 点。';
    state.rp -= costOf(cls);
    const name = 'JCS ' + JC_NAMES[state.nameIdx % JC_NAMES.length] + (state.nameIdx >= JC_NAMES.length ? ' II' : '');
    state.nameIdx++;
    state.fleet.push({ id: 'c_' + U.uid(), name, cls, propFraction: 1, hull: 1, systems: { drive: 1, radiators: 1, sensors: 1, weapons: 1 } });
    state.log.push(name + ' 下水服役（' + OD.Ships.CLASSES[cls].name + '）。');
    return null;
  }
  function endTurn(state) {
    state.turn++;
    let income = 0;
    for (const n of NODES) if (state.nodes[n.id].owner === 'JC') income += INCOME[n.kind] || 0;
    state.rp += income;
    const notes = ['Turn ' + state.turn + '. Requisition +' + income + '.'];
    // Authority reinforcements and raids.
    const rng = U.rng(state.turn * 7919 + 13);
    if (state.turn % 3 === 0) {
      const isa = NODES.filter((n) => state.nodes[n.id].owner === 'ISA');
      if (isa.length) { const n = rng.pick(isa); const cls = rng.pick(['corvette', 'frigate', 'frigate', 'lancer', 'destroyer']); state.nodes[n.id].garrison.push(cls); notes.push('一艘管理局' + (OD.Ships.roleName ? OD.Ships.roleName({ role: cls }) : cls) + '抵达 ' + n.name + '。'); }
    }
    if (state.turn % 4 === 0) {
      const targets = NODES.filter((n) => state.nodes[n.id].owner === 'JC' && n.id !== 'callisto' && neighbours(n.id).some((nb) => state.nodes[nb.id].owner === 'ISA' && state.nodes[nb.id].garrison.length));
      if (targets.length) {
        const t = rng.pick(targets);
        if (state.fleetAt === t.id) notes.push('管理局对 ' + t.name + ' 的袭击，看到舰队就掉头了。');
        else if (t.kind === 'station') notes.push((t.name.split(' · ')[1] || t.name) + ' 用空间站激光打退了管理局的袭击。');
        else { state.nodes[t.id].owner = 'ISA'; state.nodes[t.id].garrison = ['frigate', 'corvette']; notes.push(t.name + ' 已被管理局的袭击拿下。'); }
      }
    }
    state.log.push(...notes);
    checkOutcome(state);
    return notes;
  }
  function checkOutcome(state) {
    if (state.nodes.io.owner === 'JC' && state.nodes.amalthea.owner === 'JC') state.outcome = 'victory';
    else if (state.nodes.callisto.owner !== 'JC' || (state.fleet.length === 0 && state.rp < 40)) state.outcome = 'defeat';
    return state.outcome;
  }

  function buildBattle(state) {
    const def = node(state.fleetAt);
    const n = state.nodes[state.fleetAt];
    const body = def.body ? P.bodies[def.body] : null;
    const alt = def.body === 'jupiter' ? km(220000) : km(2800);
    const ships = [];
    state.fleet.forEach((s, i) => {
      const spec = { id: s.id, name: s.name, cls: s.cls, faction: 'JC', player: true, propFraction: s.propFraction, hull: s.hull, systems: { ...s.systems } };
      if (s.components && s.components.length) spec.components = s.components.map((c) => ({ ...c })); // wear carried from the last fight
      if (s.crew) spec.crew = { ...s.crew }; // the people carried from the last fight (v13)
      if (body) { spec.orbit = { altitude: alt, angle: 0 }; spec.offset = { x: (i % 2) * km(40), y: i * km(50) }; } else { spec.pos = { x: -km(600), y: i * km(50) }; spec.vel = { x: 0, y: 0 }; }
      ships.push(spec);
    });
    const names = ['Sabre', 'Coriolis', 'Tenacity', 'Vigil', 'Ardent', 'Fervent', 'Lark', 'Meridian', 'Resolve', 'Cadence'];
    n.garrison.forEach((cls, i) => {
      const spec = { id: 'g' + i, name: 'ISV ' + names[i % names.length], cls, faction: 'ISA', ai: true, propFraction: 0.9 };
      const r = body ? body.radius + alt : 0;
      if (body) { spec.orbit = { altitude: alt + km(300 + i * 150), angle: km(1200) / r }; } else { spec.pos = { x: km(600), y: i * km(60) }; spec.vel = { x: 0, y: 0 }; spec.heading = Math.PI; }
      ships.push(spec);
    });
    if (def.kind === 'station' || def.kind === 'base') {
      const spec = { id: 'nodestation', name: def.name.split(' · ')[1] || def.name, cls: 'station', faction: n.owner === 'JC' ? 'JC' : 'ISA', ai: true };
      if (body) spec.orbit = { altitude: alt, angle: km(700) / (body.radius + alt) }; else spec.pos = { x: km(700), y: -km(100) };
      ships.push(spec);
    }
    return {
      name: def.name, body, sunAngle: (state.turn * 0.7) % U.TAU, playerFaction: 'JC', ships,
      objectives: [{ id: 'n', text: '使管理局驻军失能', type: 'neutralize', targets: 'hostiles' }],
      intro: [{ speaker: 'Tactical', text: '管理局驻军，位于 ' + def.name + ', ' + n.garrison.length + ' ships.', kind: 'info' }],
      triggers: [],
    };
  }
  function applyBattle(state, sim, outcome) {
    const next = [];
    for (const s of state.fleet) {
      const sh = sim.byId(s.id);
      if (!sh || sh.destroyed) { state.log.push(s.name + ' 在 ' + node(state.fleetAt).name + ' 损失。'); continue; }
      s.propFraction = sh.propMass / sh.fullPropMass; s.hull = sh.hull; s.systems = { ...sh.systems };
      if (OD.Damage && OD.Damage.toRecord) s.components = OD.Damage.toRecord(sh);
      if (OD.Crew && typeof OD.Crew.toRecord === 'function') { s.crew = OD.Crew.toRecord(sh); if (typeof OD.Crew.afterBattle === 'function') OD.Crew.afterBattle(s.crew, true); }
      if (sh.captured) continue;
      next.push(s);
    }
    // Prizes join the fleet.
    for (const sh of sim.ships) if (sh.captured && sh.faction === 'JC' && sh.role !== 'station' && !state.fleet.some((f) => f.id === sh.id)) {
      const prize = { id: 'c_' + U.uid(), name: sh.name.replace('ISV', 'JCS'), cls: sh.cls, propFraction: sh.propMass / sh.fullPropMass, hull: sh.hull, systems: { ...sh.systems, weapons: Math.min(sh.systems.weapons, 0.6) } };
      if (OD.Damage && OD.Damage.toRecord) { prize.components = OD.Damage.toRecord(sh); OD.Damage.limitWeapons(prize, 0.6); } // a prize crew works only part of the rack
      next.push(prize);
      state.log.push(sh.name + ' 被俘获，编入舰队。');
    }
    state.fleet = next;
    const n = state.nodes[state.fleetAt];
    if (outcome === 'victory') { n.owner = 'JC'; n.garrison = []; state.log.push(node(state.fleetAt).name + ' 现已由盟约控制。'); }
    else { n.garrison = n.garrison.filter((c, i) => { const g = sim.byId('g' + i); return g && !g.neutralised(); }); if (!n.garrison.length) { n.owner = 'JC'; state.log.push('驻军被打光了，' + node(state.fleetAt).name + ' 归我们了。'); } }
    checkOutcome(state);
  }

  // ------------------------------------------------------------ screen
  // The map's own rules (the page's stylesheet holds the rest under the same class names).
  const CAMP_CSS = `
#campaign .camp-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px 28px; margin-bottom: 10px; }
#campaign .camp-title { text-transform: uppercase; line-height: 1; margin: 8px 0 0; }
#campaign .camp-stats { display: flex; gap: 26px; padding-bottom: 2px; }
#campaign .camp-stats > div { display: flex; flex-direction: column; gap: 3px; }
#campaign .camp-stats .k { font-family: var(--display); font-weight: 600; font-size: 10.5px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--dim); }
#campaign .camp-stats .v { font-family: var(--display); font-weight: 600; font-size: 24px; line-height: 1; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; color: var(--ink); }
#campaign #cBuy { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
#campaign #cBuy:empty { display: none; }
#campaign #cBuy button { text-align: left; padding: 8px 12px; font-size: 12.5px; }
#campaign .camp-reset { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px 14px; margin-top: 26px; padding-top: 12px; border-top: 1px solid var(--line); }
#campaign .camp-reset-note { color: #ffb0b0; font-size: 12.5px; flex: 1 1 240px; text-align: right; }
#campaign #cRestart { --tickd: linear-gradient(rgba(255,107,107,0.5), rgba(255,107,107,0.5)); --tick: linear-gradient(var(--crit), var(--crit)); padding: 7px 14px; font-size: 12px; }
#campaign #cRestart.armed { background-color: rgba(255,107,107,0.16); color: #ffd0d0; }
#campaign .camp-kv { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 10px; font-size: 12px; line-height: 1.45; }
#campaign .camp-kv .k { color: var(--dim); white-space: nowrap; }
#campaign .camp-kv .v { margin-left: auto; text-align: right; font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
#campaign .camp-kv .v > span { white-space: nowrap; }
#campaign .camp-kv .v .warn { color: var(--warn); }
#campaign .camp-routekey { margin-top: 6px; font-size: 12px; color: var(--dim); }
#campaign .camp-routekey b { font-weight: 600; color: var(--warn); }
#campaign .camp-routekey[hidden] { display: none; }
@media (max-width: 900px) {
  #campaign #campMap { height: 300px; }
  #campaign .camp-reset-note { text-align: left; }
}
`;
  function injectStyle() {
    if (document.getElementById('camp-style')) return;
    const s = document.createElement('style'); s.id = 'camp-style'; s.textContent = CAMP_CSS; document.head.appendChild(s);
  }

  // Label placement: every name goes where it covers no node, no garrison flag, no other name and not Jupiter's
  // disc. Each label tries spots round its node, nearest first, then further out on a leader line.
  const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const boxAt = (cx, cy, w, h) => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });
  function discHit(b, c) {   // how deep a box reaches into a circle (0 when clear)
    const nx = Math.max(b.x0, Math.min(c.x, b.x1)), ny = Math.max(b.y0, Math.min(c.y, b.y1));
    return Math.max(0, c.r - Math.hypot(nx - c.x, ny - c.y));
  }
  function segClip(ax, ay, bx, by, b) {   // the part of a line segment inside a box, as [t0, t1] along it, or null
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    for (const [p, q] of [[-dx, ax - b.x0], [dx, b.x1 - ax], [-dy, ay - b.y0], [dy, b.y1 - ay]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return t1 - t0 > 0.02 ? [t0, t1] : null;
  }
  const segHitsBox = (ax, ay, bx, by, b) => !!segClip(ax, ay, bx, by, b);   // does a line segment pass through a box
  const ptBox = (x, y, b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));   // 0 inside the box
  const boxGap = (a, b) => Math.hypot(Math.max(b.x0 - a.x1, 0, a.x0 - b.x1), Math.max(b.y0 - a.y1, 0, a.y0 - b.y1));
  function segPt(x, y, ax, ay, bx, by) {   // distance from a point to a line segment
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  }
  function boxSeg(b, ax, ay, bx, by) {   // gap between a box and a line segment (0 when they touch)
    const e = Math.min(ptBox(ax, ay, b), ptBox(bx, by, b));
    if (e === 0 || segHitsBox(ax, ay, bx, by, b)) return 0;
    return Math.min(e, segPt(b.x0, b.y0, ax, ay, bx, by), segPt(b.x1, b.y0, ax, ay, bx, by), segPt(b.x0, b.y1, ax, ay, bx, by), segPt(b.x1, b.y1, ax, ay, bx, by));
  }
  function placeLabels(items, fixed, discs, lines, w, h) {
    // items: { id, x, y, r, tw, th, crowd }; fixed: boxes no name may cover (flags, the FLEET mark); discs: circles
    // (the nodes and Jupiter) with a weight per pixel of reach into them; lines: the routes, a cost to cross
    const placed = {};
    const cands = (it) => {
      const out = [], g = 4, d = it.r + g;
      const add = (cx, cy, pen, lead) => out.push({ box: boxAt(cx, cy, it.tw + 4, it.th), pen, lead });
      for (const [k, far] of [[0, 0], [1, 16], [2, 34]]) {
        const e = d + far, lead = far > 0;
        add(it.x, it.y - e - it.th / 2, 0 + k * 6, lead);                              // above
        add(it.x, it.y + e + it.th / 2, 1 + k * 6, lead);                              // below
        add(it.x + e + it.tw / 2 + 2, it.y, 2 + k * 6, lead);                         // right
        add(it.x - e - it.tw / 2 - 2, it.y, 2 + k * 6, lead);                         // left
        add(it.x + e * 0.75 + it.tw / 2 - 2, it.y - e * 0.75 - it.th / 2 + 2, 3 + k * 6, lead); // above right
        add(it.x - e * 0.75 - it.tw / 2 + 2, it.y - e * 0.75 - it.th / 2 + 2, 3 + k * 6, lead); // above left
        add(it.x + e * 0.75 + it.tw / 2 - 2, it.y + e * 0.75 + it.th / 2 - 2, 4 + k * 6, lead); // below right
        add(it.x - e * 0.75 - it.tw / 2 + 2, it.y + e * 0.75 + it.th / 2 - 2, 4 + k * 6, lead); // below left
      }
      return out;
    };
    const score = (it, c) => {
      const b = c.box;
      let s = c.pen;
      if (b.x0 < 2 || b.y0 < 2 || b.x1 > w - 2 || b.y1 > h - 2) s += 4000;
      for (const f of fixed) s += overlap(b, f) * 40;
      for (const dc of discs) s += discHit(b, dc) * dc.wt;
      for (const id in placed) if (id !== it.id) s += overlap(b, placed[id].box) * 60;
      // a name keeps off the routes open this turn, whose costs need the room. The fleet's own name may cover the
      // first stretch of one (under half its length, 40 px at most), where no cost goes. Any other route costs little to cross.
      for (const l of lines) {
        const cl = segClip(l.ax, l.ay, l.bx, l.by, b); if (!cl) continue;
        if (l.open) { const len = Math.hypot(l.bx - l.ax, l.by - l.ay), reach = (l.a === it.id ? cl[1] : 1 - cl[0]) * len; s += it.fleet && reach < Math.min(40, len * 0.45) ? 0 : 12; }
        else if (l.a !== it.id && l.b !== it.id) s += 3;
      }
      return s;
    };
    const order = items.slice().sort((a, b) => b.crowd - a.crowd);
    for (let pass = 0; pass < 3; pass++) {
      for (const it of order) {
        let best = null, bs = Infinity;
        for (const c of cands(it)) { const s = score(it, c); if (s < bs) { bs = s; best = c; } }
        placed[it.id] = best;
      }
    }
    return placed;
  }

  function drawMap(canvas, state, sel, hover) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, w, h);
    const rng = U.rng(3);
    for (let i = 0; i < 260; i++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + rng() * 0.5) + ')'; ctx.fillRect(rng() * w, rng() * h, 1, 1); }
    // Jupiter and its orbit rings scale with the map's width, so a phone map keeps the laptop map's proportions
    const u = Math.min(1, w / 726);
    const jx = w * 0.47, jy = h * 0.5, jr = Math.max(18, 41 * u);
    const g = ctx.createRadialGradient(jx - jr * 0.4, jy - jr * 0.3, jr * 0.08, jx, jy, jr * 1.3);
    g.addColorStop(0, '#e2c39a'); g.addColorStop(0.6, '#c9a37a'); g.addColorStop(1, '#5a4330');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(jx, jy, jr, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(201,163,122,0.15)'; ctx.lineWidth = 1;
    for (const r of [110, 190, 270]) { ctx.beginPath(); ctx.arc(jx, jy, r * u, 0, U.TAU); ctx.stroke(); }
    // the planet's own name: printed on its disc when the disc is big enough to carry it, so it never takes a
    // node's room; on a small map it is placed beside the disc like any other name (below)
    const jOnDisc = jr >= 30;
    if (jOnDisc) {
      ctx.save();
      ctx.fillStyle = 'rgba(52,34,18,0.72)'; ctx.font = '700 10px "Rajdhani", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let jw = 0; for (const ch of 'JUPITER') jw += ctx.measureText(ch).width + 2; jw -= 2;
      let jcx = jx - jw / 2; for (const ch of 'JUPITER') { const cw = ctx.measureText(ch).width; ctx.fillText(ch, jcx + cw / 2, jy + 1); jcx += cw + 2; }
      ctx.restore();
    }
    const pos = (n) => ({ x: n.x * w, y: n.y * h });
    const colour = (o) => o === 'JC' ? '#4fd1c5' : o === 'ISA' ? '#f0a04b' : '#8f9bad';
    // edges; the costs of the routes open this turn are drawn last, so nothing sits on one
    const costs = [], lines = [];
    for (const [a, b, dv] of EDGES) {
      const pa = pos(node(a)), pb = pos(node(b));
      const adj = a === state.fleetAt || b === state.fleetAt;
      ctx.strokeStyle = adj ? 'rgba(79,209,197,0.55)' : 'rgba(127,142,163,0.25)'; ctx.lineWidth = adj ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      const line = { a, b, ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y, open: adj };
      lines.push(line);
      // a route the fleet cannot afford (a ship would drop under its 6 km/s reserve: canMove's own test) is costed in amber
      if (adj) costs.push({ a, b, line, pa, pb, dv, short: !canMove(state, a === state.fleetAt ? b : a).ok });
    }
    // what a label may not cover: every node, its garrison flag, the FLEET mark, and the disc
    const nodeR = (n) => (state.fleetAt === n.id ? 17 : 11);   // one size whether selected or not, so a click never moves a name
    const fixed = [], discs = [{ x: jx, y: jy, r: jr + 4, wt: 400 }], flags = {};
    let fleetMark = { dx: 0, dy: 27 };
    ctx.font = '600 10px "Rajdhani", sans-serif';
    for (const n of NODES) {
      const p = pos(n), st = state.nodes[n.id], r = nodeR(n);
      discs.push({ x: p.x, y: p.y, r, wt: 300 });
      if (st.garrison.length) fixed.push(flags[n.id] = { x0: p.x + 10, y0: p.y - 6, x1: p.x + 14 + ctx.measureText('⚑ ' + st.garrison.length).width, y1: p.y + 7 });
      if (state.fleetAt === n.id) {
        // the FLEET mark sits under the ring; over it, or beside it, when under would put it on the disc, on another
        // node, off the map, or across a route open this turn (that route's cost needs the room)
        const marks = [[0, 27], [0, -27], [40, 0], [-40, 0]].map(([dx, dy]) => ({ dx, dy, b: boxAt(p.x + dx, p.y + dy, 36, 12) }));
        const onMap = (q) => !discHit(q.b, discs[0]) && q.b.x0 >= 2 && q.b.y0 >= 2 && q.b.x1 <= w - 2 && q.b.y1 <= h - 2;
        const clean = (q) => onMap(q) && !(flags[n.id] && overlap(q.b, flags[n.id])) && !NODES.some((m) => m !== n && discHit(q.b, { x: m.x * w, y: m.y * h, r: 11 }) > 0) &&
          !lines.some((l) => l.open && segHitsBox(l.ax, l.ay, l.bx, l.by, q.b));
        fleetMark = marks.find(clean) || marks.slice(0, 2).find(onMap) || marks[1];
        fixed.push(fleetMark.b);
      }
    }
    // nodes
    for (const n of NODES) {
      const p = pos(n), st = state.nodes[n.id];
      const c = colour(st.owner);
      const isSel = sel === n.id, isHover = hover === n.id;
      ctx.beginPath(); ctx.arc(p.x, p.y, isSel ? 11 : 8, 0, U.TAU);
      ctx.fillStyle = st.owner === 'JC' ? 'rgba(79,209,197,0.3)' : st.owner === 'ISA' ? 'rgba(240,160,75,0.3)' : 'rgba(143,155,173,0.25)'; ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = isSel || isHover ? 2.5 : 1.5; ctx.stroke();
      if (n.kind === 'yard' || n.kind === 'port') { ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke(); }
      if (st.garrison.length) { ctx.fillStyle = '#f0a04b'; ctx.font = '600 10px "Rajdhani", sans-serif'; ctx.textAlign = 'left'; ctx.fillText('⚑ ' + st.garrison.length, p.x + 12, p.y + 4); }
      if (state.fleetAt === n.id) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, U.TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff'; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('FLEET', p.x + fleetMark.dx, p.y + fleetMark.dy + 3);
      }
    }
    // node names
    ctx.font = '600 12px "Rajdhani", sans-serif';
    const items = NODES.map((n) => {
      const p = pos(n), label = n.name.split(' · ')[0];
      const crowd = NODES.reduce((s, m) => { const q = pos(m); const d = Math.hypot(q.x - p.x, q.y - p.y); return s + (m !== n && d < 110 ? 1 : 0); }, 0) + (Math.hypot(p.x - jx, p.y - jy) < jr + 60 ? 2 : 0);
      return { id: n.id, label, x: p.x, y: p.y, r: nodeR(n), tw: Math.ceil(ctx.measureText(label).width), th: 13, crowd, fleet: n.id === state.fleetAt };
    });
    const JFONT = '600 10.5px "Rajdhani", sans-serif';
    if (!jOnDisc) { ctx.font = JFONT; items.push({ id: 'jupiter', label: 'JUPITER', x: jx, y: jy, r: jr + 1, tw: Math.ceil(ctx.measureText('JUPITER').width), th: 12, crowd: -1 }); ctx.font = '600 12px "Rajdhani", sans-serif'; }
    const where = placeLabels(items, fixed, discs, lines, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const it of items) {
      const b = where[it.id].box, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      if (where[it.id].lead) {   // a name set further out points back at its node
        const ex = Math.max(b.x0, Math.min(it.x, b.x1)), ey = Math.max(b.y0, Math.min(it.y, b.y1)), a = Math.atan2(ey - it.y, ex - it.x);
        ctx.strokeStyle = 'rgba(215,224,234,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(it.x + Math.cos(a) * (it.r + 1), it.y + Math.sin(a) * (it.r + 1)); ctx.lineTo(ex, ey); ctx.stroke();
      }
      const isJ = it.id === 'jupiter';
      ctx.font = isJ ? JFONT : '600 12px "Rajdhani", sans-serif';
      ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.lineWidth = 3; ctx.strokeText(it.label, cx, cy + 0.5);
      ctx.fillStyle = isJ ? 'rgba(226,195,154,0.7)' : sel === it.id ? '#ffffff' : '#d7e0ea'; ctx.fillText(it.label, cx, cy + 0.5);
      fixed.push(b);
    }
    // route costs, on the map's own ground. Each slides along its route to a spot that reads as that route's and no
    // other: clear of every node, name and cost, at least 14 px from every other open route and from every node the
    // route does not join, and nearer its own line than any other open route. Three passes, so the costs settle together.
    ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle';
    const NEAR = 14, FS = [];
    for (let i = 0; i <= 18; i++) FS.push(0.14 + i * 0.04);
    FS.sort((p, q) => Math.abs(p - 0.5) - Math.abs(q - 0.5));
    for (const c of costs) { c.label = c.dv.toFixed(1) + ' km/s'; c.tw = ctx.measureText(c.label).width + 6; }
    const spot = (c, taken) => {
      const ex = c.pb.x - c.pa.x, ey = c.pb.y - c.pa.y, len = Math.hypot(ex, ey) || 1, nx = -ey / len, ny = ex / len;
      // where a cost may go: on its route or beside it, or, when the route is too short to carry it, beside the node
      // it leads to (it then reads as that node's cost, which it is)
      const cands = [];
      for (const f of FS) for (const off of [0, 8, -8, 14, -14, 20, -20, 26, -26, 32, -32]) cands.push({ lx: c.pa.x + ex * f + nx * off, ly: c.pa.y + ey * f + ny * off, pen: Math.abs(f - 0.5) * 20 });
      const far = c.a === state.fleetAt ? c.pb : c.pa, e = 11 + 3;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [0.75, -0.75], [-0.75, -0.75], [0.75, 0.75], [-0.75, 0.75]]) cands.push({ lx: far.x + dx * (e + c.tw / 2), ly: far.y + dy * (e + 6), pen: 60, beside: true });
      let best = null, bs = Infinity;
      for (const cd of cands) {
        const lx = cd.lx, ly = cd.ly, b = boxAt(lx, ly, c.tw, 12);
        // on its own line or touching it, or beside its node
        const own = cd.beside ? 0 : segPt(lx, ly, c.pa.x, c.pa.y, c.pb.x, c.pb.y);
        let s = cd.pen + (cd.beside ? 0 : boxSeg(b, c.pa.x, c.pa.y, c.pb.x, c.pb.y) * 6 + own * 0.5);
        if (b.x0 < 2 || b.y0 < 2 || b.x1 > w - 2 || b.y1 > h - 2) s += 4000;
        for (const fx of fixed) s += overlap(b, fx) * 50;
        for (const t of taken) s += overlap(b, t) * 50 + Math.max(0, 4 - boxGap(b, t)) * 12;
        for (const dc of discs) s += discHit(b, dc) * (dc === discs[0] ? dc.wt / 3 : dc.wt);   // a cost may lap Jupiter's rim, never a node
        for (const l of lines) {
          if (l === c.line) continue;
          if (l.open) {
            const d = boxSeg(b, l.ax, l.ay, l.bx, l.by), mid = segPt(lx, ly, l.ax, l.ay, l.bx, l.by);
            if (d < NEAR) s += (NEAR - d) * 8;
            if (mid < own + (cd.beside ? 12 : 6)) s += 3000 + (own + 6 - mid) * 20;   // the cost's middle is as near another open route as its own
          } else if (segHitsBox(l.ax, l.ay, l.bx, l.by, b)) s += 4;   // a faint route through the box: a small cost, as for the names
        }
        for (const n of NODES) {
          if (n.id === c.a || n.id === c.b) continue;
          const p = pos(n), d = ptBox(p.x, p.y, b) - 11;   // the selected ring's size, so a click never moves a cost
          if (d < NEAR) s += (NEAR - d) * 12;
          const clear = cd.beside ? 14 : 6;   // nor hard by its name or flag; a cost set beside a node keeps well clear of the others'
          for (const nb of [where[n.id] && where[n.id].box, flags[n.id]]) if (nb) { const g = boxGap(b, nb); if (g < clear) s += (clear - g) * 12; }
        }
        if (s < bs) { bs = s; best = { lx, ly, b }; }
      }
      return best;
    };
    const spots = costs.map(() => null);
    for (let pass = 0; pass < 3; pass++) costs.forEach((c, i) => { spots[i] = spot(c, spots.filter((q, j) => q && j !== i).map((q) => q.b)); });
    costs.forEach((c, i) => {
      const best = spots[i];
      ctx.fillStyle = 'rgba(8,12,18,0.88)'; ctx.fillRect(best.b.x0, best.b.y0, best.b.x1 - best.b.x0, best.b.y1 - best.b.y0);
      if (c.short) { ctx.strokeStyle = 'rgba(255,180,84,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(best.b.x0 + 0.5, best.b.y0 + 0.5, best.b.x1 - best.b.x0 - 1, best.b.y1 - best.b.y0 - 1); }
      ctx.fillStyle = c.short ? '#ffb454' : 'rgba(215,224,234,0.9)'; ctx.textAlign = 'center'; ctx.fillText(c.label, best.lx, best.ly + 0.5);
    });
    ctx.textBaseline = 'alphabetic';
  }

  function screen(game, state) {
    const UI = OD.UI;
    state = state || load() || newState();
    save(state);
    let sel = state.fleetAt, hover = null;
    const def = () => node(state.fleetAt);
    // The people aboard, from the record the last fight left (v13): fit, wounded, lost, and how seasoned.
    // Two rows, as in the hangar: a value too long for its row drops under its label, right-aligned, and splits
    // only at a " · ".
    const crewLine = (s) => {
      const c = s.crew; if (!c || !(c.fit >= 0)) return '';
      const xp = Math.max(0, Math.min(3, Math.round(c.xp || 0)));
      const parts = ['<span>' + c.fit + ' fit</span>']; if (c.wounded > 0) parts.push('<span class="warn">' + c.wounded + ' wounded</span>'); if (c.lost > 0) parts.push('<span>' + c.lost + ' lost</span>');
      const exp = ['<span>' + xp + ' of 3</span>']; if (xp > 0) exp.push('<span>repairs ' + xp * 15 + ' % faster</span>');
      const row = (k, v) => '<div class="camp-kv"><span class="k">' + k + '</span><span class="v">' + v.join(' · ') + '</span></div>';
      return row('Crew', parts) + row('Experience', exp);
    };
    const fleetHtml = () => state.fleet.map((s) => '<div class="ship"><span><b>' + U.escapeHtml(s.name) + '</b> <span style="color:var(--dim)">' + OD.Ships.CLASSES[s.cls].role + '</span></span><span class="num">' + U.fmt.dv(shipDv(s)) + '</span><div class="bars"><div class="bar dv"><i style="width:' + Math.round(s.propFraction * 100) + '%"></i></div><div class="bar hull' + (s.hull < 0.35 ? ' crit' : '') + '"><i style="width:' + Math.round(s.hull * 100) + '%"></i></div></div>' + crewLine(s) + '</div>').join('') || '<div style="color:var(--dim)">没有舰船。先造一艘。</div>';
    // the turn and the requisition in hand read as two figures beside the title, not one long eyebrow line
    const html = '<div class="camp-head"><div><div class="eyebrow">战役</div><h2 class="title camp-title">The Jovian system</h2></div>' +
      '<div class="camp-stats"><div><span class="k">回合</span><span class="v" id="cTurn">' + state.turn + '</span></div><div><span class="k">征用点</span><span class="v" id="cRp">' + state.rp + '</span></div></div></div>' +
      '<div class="camp-grid"><div><canvas id="campMap"></canvas><p class="camp-routekey" id="cRouteKey" hidden></p><p class="sub" id="cNodeDesc" style="margin-top:8px;font-size:13px"></p></div>' +
      '<div class="camp-side"><div class="box"><h4>Selected</h4><div id="cNodeInfo"></div><div class="actions" id="cNodeActions" style="margin-top:8px"></div></div>' +
      '<div class="box"><h4>舰队 · 位于 ' + U.escapeHtml(def().name.split(' · ')[0]) + '</h4><div id="cFleet">' + fleetHtml() + '</div><div class="actions" id="cBuy" style="margin-top:8px"></div></div>' +
      '<div class="box"><h4>Log</h4><div id="cLog" style="max-height:120px;overflow:auto;font-size:11px;color:var(--ink-2)">' + state.log.slice(-8).map((l) => '<div>' + U.escapeHtml(l) + '</div>').join('') + '</div></div></div></div>' +
      '<div class="actions"><button class="primary" id="cEnd">End turn</button><button id="cResupply">Refuel &amp; repair here</button><button id="cBack">Menu</button></div>' +
      // the restart key stands apart from the turn keys, and asks once before it wipes the save
      '<div class="camp-reset"><span class="camp-reset-note" id="cRestartNote" role="status" aria-live="polite"></span><button id="cRestart" class="danger">Restart campaign</button></div>';
    injectStyle();
    const el = UI.screen('campaign', html, { wide: true });
    const canvas = el.querySelector('#campMap');
    const redraw = () => drawMap(canvas, state, sel, hover);
    // the key to the amber costs, only when a cost is more than the fleet can spend: the ship with the least delta-v sets it
    const shortRoutes = neighbours(state.fleetAt).filter((nb) => !canMove(state, nb.id).ok);
    if (shortRoutes.length && state.fleet.length) {
      const low = state.fleet.reduce((m, f) => (shipDv(f) < shipDv(m) ? f : m), state.fleet[0]);
      const key = el.querySelector('#cRouteKey');
      key.innerHTML = '标成<b>琥珀色</b>的价钱是舰队付不起的：' + U.escapeHtml(low.name) + ' 只剩 ' + U.fmt.dv(shipDv(low)) + '，还要留 6 公里/秒用来打仗。';
      key.hidden = false;
    }
    const refreshSide = () => {
      const n = node(sel), st = state.nodes[sel];
      el.querySelector('#cNodeDesc').textContent = n.name + ' — ' + n.desc;
      el.querySelector('#cNodeInfo').innerHTML = '<b>' + U.escapeHtml(n.name) + '</b><br>归属：<span style="color:' + (st.owner === 'JC' ? 'var(--accent)' : st.owner === 'ISA' ? 'var(--accent-2)' : 'var(--dim)') + '">' + (st.owner === 'JC' ? '盟约' : st.owner === 'ISA' ? '管理局' : '无主') + '</span>' + (st.garrison.length ? '<br>驻军：' + st.garrison.map((c) => OD.Ships.CLASSES[c].role).join('、') : '') + (sel !== state.fleetAt && edgeDv(state.fleetAt, sel) != null ? '<br>转移：每艘 ' + edgeDv(state.fleetAt, sel).toFixed(1) + ' 公里/秒' : '');
      const acts = el.querySelector('#cNodeActions'); acts.innerHTML = '';
      if (sel !== state.fleetAt) {
        const r = canMove(state, sel);
        const b = document.createElement('button'); b.className = 'primary'; b.textContent = '调动舰队'; b.disabled = !r.ok; b.title = r.ok ? '' : r.why;
        b.addEventListener('click', () => { const m = move(state, sel); if (!m.ok) { UI.toast(m.why); return; } save(state); if (battleHere(state)) launchBattle(); else screen(game, state); });
        acts.appendChild(b);
        if (!r.ok) { const s = document.createElement('span'); s.style.cssText = 'color:var(--dim);font-size:11px;align-self:center'; s.textContent = r.why; acts.appendChild(s); }
      } else if (battleHere(state)) {
        const b = document.createElement('button'); b.className = 'primary'; b.textContent = '攻击驻军'; b.addEventListener('click', launchBattle); acts.appendChild(b);
      }
      const buyEl = el.querySelector('#cBuy'); buyEl.innerHTML = '';
      const here = def();
      if ((here.kind === 'yard' || here.kind === 'port') && state.nodes[state.fleetAt].owner === 'JC') {
        for (const cls of yardList()) {
          const b = document.createElement('button'); b.className = 'sm'; b.textContent = (OD.Ships.CLASSES[cls].custom ? OD.Ships.CLASSES[cls].name : cls) + ' · ' + costOf(cls); b.disabled = state.rp < costOf(cls);
          b.addEventListener('click', () => { const err = buy(state, cls); if (err) UI.toast(err); else { save(state); screen(game, state); } });
          buyEl.appendChild(b);
        }
        // v8: the slipway. Inspect each ship of the fleet and swap a hull for a saved design of the same family for the RP difference.
        if (game && typeof game.refitFleet === 'function' && OD.Configurator && state.fleet && state.fleet.length) {
          const b = document.createElement('button'); b.className = 'sm'; b.textContent = '改装舰队';
          b.title = '逐艘检视，把舰体换成同族的已保存设计，只需补征用点差价。';
          b.addEventListener('click', () => { save(state); game.refitFleet(state); });
          buyEl.appendChild(b);
        }
      }
    };
    const launchBattle = () => {
      const scenario = buildBattle(state);
      game.startScenario(scenario, { mode: 'Campaign', brief: { title: def().name, text: [def().desc, '活下来的舰船会带着损伤和剩下的推进剂进入下一回合。战利品加入舰队。'] }, onEnd: (outcome, sim) => { applyBattle(state, sim, outcome); save(state); if (state.outcome) finish(); else screen(game, state); } });
    };
    const finish = () => {
      const v = state.outcome === 'victory';
      const e = UI.screen('campend', '<div class="eyebrow">战役</div><h2 class="title ' + (v ? 'debrief-victory' : '') + '" style="color:' + (v ? 'var(--accent)' : 'var(--crit)') + '">' + (v ? '木星系属于盟约' : '盟约已经陷落') + '</h2><p class="sub">' + (v ? 'Io 和 Amalthea 在第 ' + state.turn + ' 回合归你。管理局剩下的舰船往内星系烧去了，封锁结束了。' : 'Callisto 没了，或者舰队没了。管理局又把各卫星当关税区管起来。') + '</p><div class="actions"><button class="primary" id="ceNew">新战役</button><button id="ceMenu">菜单</button></div>');
      e.querySelector('#ceNew').addEventListener('click', () => { clear(); screen(game, newState()); });
      e.querySelector('#ceMenu').addEventListener('click', () => game.showMenu());
    };
    const hit = (ev) => {
      const r = canvas.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      let best = null, bd = 0.0016;
      for (const n of NODES) { const d = (n.x - x) ** 2 + ((n.y - y) * (r.height / r.width)) ** 2; if (d < bd) { bd = d; best = n.id; } }
      return best;
    };
    canvas.addEventListener('mousemove', (ev) => { const h = hit(ev); if (h !== hover) { hover = h; redraw(); } canvas.style.cursor = h ? 'pointer' : 'default'; });
    canvas.addEventListener('click', (ev) => { const h = hit(ev); if (h) { sel = h; refreshSide(); redraw(); } });
    el.querySelector('#cEnd').addEventListener('click', () => { const notes = endTurn(state); save(state); if (state.outcome) finish(); else { screen(game, state); UI.toast(notes[notes.length - 1]); } });
    el.querySelector('#cResupply').addEventListener('click', () => { if (state.nodes[state.fleetAt].owner !== 'JC') { UI.toast('只能在盟约的港口、船坞、空间站或补给站补给。'); return; } if (resupply(state)) { save(state); screen(game, state); UI.toast('已补给完毕。'); } else UI.toast('推进剂是满的，也没有东西要修。'); });
    // first press arms the key and says what goes; a second press within five seconds wipes the campaign
    const restartBtn = el.querySelector('#cRestart'), restartNote = el.querySelector('#cRestartNote');
    let armed = 0;
    const disarm = () => { clearTimeout(armed); armed = 0; restartBtn.classList.remove('armed'); restartBtn.textContent = '重新开始战役'; restartNote.textContent = ''; };
    restartBtn.addEventListener('click', () => {
      if (armed) { disarm(); clear(); screen(game, newState()); return; }
      // name only what there is to lose: no "0 ships" once the fleet is gone
      const ships = state.fleet.length, lost = ['turn ' + state.turn];
      if (state.rp > 0) lost.push(state.rp + ' requisition');
      if (ships > 0) lost.push(ships + (ships === 1 ? ' ship' : ' ships'));
      const list = lost.length > 1 ? lost.slice(0, -1).join(', ') + ' and ' + lost[lost.length - 1] : lost[0];
      restartNote.textContent = '重新开始会失去 ' + list + '。5 秒内按确认重新开始。';
      restartBtn.textContent = '确认重新开始'; restartBtn.classList.add('armed');
      armed = setTimeout(disarm, 5000);
    });
    el.querySelector('#cBack').addEventListener('click', () => game.showMenu());
    if (state.outcome) { finish(); return; }
    refreshSide(); redraw();
    requestAnimationFrame(redraw);
  }

  OD.Campaign = { NODES, EDGES, newState, load, save, clear, screen, buildBattle, applyBattle, endTurn, move, canMove };
})();
