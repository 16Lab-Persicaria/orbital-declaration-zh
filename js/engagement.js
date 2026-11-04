/* Orbital Declaration — engagement: what the mounts actually do to a hull.

   Four ways to hurt a ship, and they disagree about time. A beam arrives the instant it is fired
   and is defeated by range and armour. A slug is thrown at where the target will be in a minute
   and a half and is defeated by the target touching its drive. An interceptor steers, so it is
   defeated only by being shot down first, which is what point defence is for. Everything ends in
   the same place: energy past the armour, hull integrity down, a system taken with it.

   The shape of it. A beam mount emits power × efficiency. Diffraction spreads that over a spot
   that grows with range and shrinks with the aperture, and the fire-control wobble adds to the
   spot again — worse with the sensor suite shot up, worse still on a ship that is burning.
   Whatever fraction of that spot falls inside a hull's cross-section is the energy on target.
   The armour facet the shooter can see soaks a flat share of it; what is left opens the hull and
   takes a system with it. Beams never miss, so the defences are range, armour and facing.

   Three rules keep a fight from turning into arithmetic. Several beams on one hull suffer from
   the vapour they raise, so piling fire on a small ship pays less and less. Mount damage takes
   mounts out one at a time instead of dimming them all. And gunnery will not fire its own heat
   sink into saturation: a ship that wants to shoot for a long time has to fly with its radiators
   out, which is exactly when they are easiest to shoot off. */
(function () {
  'use strict';
  const OD = window.OD;
  const U = OD.U, P = OD.P;

  // ------------------------------------------------------------------ tuning
  // Everything a designer would reach for lives here. SI units unless the name says otherwise.
  const T = {
    noseArc: (10 * Math.PI) / 180, // a spinal mount fires within 10° of the nose
    cell: 2.0,                     // m² — the hull cross-section a beam is trying to stay inside
    jitter: 1.0e-6,                // rad — pointing wobble with an intact sensor suite
    jitterBlind: 2,                // × that wobble with the sensors gone
    jitterBurn: 2,                 // × extra wobble at full throttle: the mirror rides a burning ship
    // Gunnery shoots at a track, not at a ship. The sensors grade that track 1 (a contact on a
    // bearing) to 3 (a firing solution), and every mount is only as good as the track under it.
    // A poor track has to cost something a bridge can feel, or stowing the panels and going cold is
    // a free choice. It costs twice over: the beams wobble by 1 + trackJitter·(3 − q), and the
    // coilguns lead her with a velocity that is only as good as the track, so each round goes its
    // own way by the track's velocity error over the flight.
    trackJitter: 3,                // × the wobble for each point of track quality short of a solution
    slugSolutionQ: 2.7,            // a mount aimed at a place needs a solution to aim at; below this it holds fire
    salvoTrackQ: 2,                // a bay launches on a track this good: the dart's own seeker does the rest
    armourWatts: 0.06e6,           // W each cm of armour soaks before anything reaches the hull
    hullJoules: 1400,              // J per kg of dry mass to open a hull from 1.0 to 0
    systemShare: 0.22,             // a system fails after this fraction of the hull budget
    plumeWatts: 10e6,              // W a 100 m hull can absorb before its own vapour shields it
    sinkReserve: 1800,             // s of sink the mounts leave themselves before checking fire
    radiatorExtra: 2.5,            // deployed radiator panels are enormous and thin
    disableHull: 0.15,             // below this the hull is no longer a warship

    // Kinetics. A slug and an interceptor both arrive as a lump of energy, so armour stops them by
    // the joule instead of by the watt, and the facet they land on is the one the hull was showing.
    armourJoules: 1.0e6,   // J each cm of armour eats out of a kinetic hit
    slugHullLengths: 2,    // a slug tells only if the target is this many hull lengths from the aim point
    slugMaxFlight: 600,    // s — past this the firing solution is not worth the round
    // Launch doctrine, the computer's side of it: a bay is several salvos, not one button.
    launchDoctrine: 1.5,   // × the hull's class doctrine range is as far out as the AI will launch
    launchCap: 1500e3,     // m — and no farther, whatever the doctrine says. A lancer is the exception.
    salvoShare: 0.5,       // at most this much of what is still aboard goes out in one salvo
    salvoGap: 150,         // s a hull waits before the next salvo leaves the rails
    bayReserve: 0.25,      // the last quarter stays aboard unless the target is worth emptying for
    reserveWorth: ['cruiser', 'destroyer'], // — which is to say, a hull this size
    dartClosing: 6000,     // m/s — the most closing an interceptor's guidance will build in the cruise
    // A dart is not a charge, it is a lump: what it does on arrival is ½·m·v² and nothing else. At
    // 150 kg dry, arriving at the cruise speed would be gigajoules — enough to open a corvette on
    // one hit — so the guidance flips and sheds the closing again before contact. What it arrives
    // with is dartTerminal, at whatever it weighs by then: 150 kg dry at 1035 m/s is 80 MJ and the
    // reserve still in its tanks makes that nearer 90, which is the hit. A dart that runs its tanks
    // dry before it can brake arrives fast, and is booked for exactly what it arrives with.
    dartTerminal: 1035,    // m/s — the closing it means to arrive at
    dartBrakeLead: 1.05,   // × the braking distance: it flips this early, so it is not still closing
    dartLife: 700,         // s of endurance: past this a dart that never arrived is written off,
                           //   and it is what sets the launch reach (the burn, the coast and the brake inside it)
    dartReserve: 0.1,      // of its delta-v a dart keeps back for the last few kilometres — on top of
                           //   the terminal brake, which is budgeted for in full
    dartKill: 6.0e6,       // J of point-defence light that kills one interceptor
    dartCell: 0.5,         // m² — an interceptor's cross-section to a point-defence beam
    pdRange: 150e3,        // m — point defence sees nothing useful farther out

    // Fire modes. Sustained scales the beams down until the waste heat fits under the radiators,
    // so the sink never fills: weaker for ever, instead of stronger and then a forced cool-down.
    sustainMargin: 0.85,   // of the radiator power the mounts may spend; the rest is the margin
    // Aim points. A smaller part of a hull catches a smaller share of the spot, so precision is
    // paid for in energy on target. Hull is the whole cross-section and costs nothing.
    aimShare: { hull: 1, radiators: 0.34, drive: 0.3, mounts: 0.22 },

    // The ladder and the rings. A burn-through range is where energy on target inside the hull
    // cross-section falls to what that facet's armour soaks; past the cap it is not worth printing.
    beamReachCap: 5000e3,  // m
    aiSustainLoad: 0.6,    // the computer throttles its beams once its sink is past this

    // The threat board and the event ring.
    eventCap: 200,         // events kept; eventSeq counts every one ever appended
    beamEventGap: 20,      // s between burn-through events from the same hull, so a broadside is one line
    hitLogGap: 20,         // s between log lines about our own fire, with the window's count rolled in
    underFireGap: 60,      // s a hull under beams waits between 'under fire' lines, with the window's joules in it
    leadPasses: 3,         // passes of the ballistic lead: the straight answer, then what the field did to it
    leadStep: 2,           // s per step of the free-fall prediction the lead and the threat board work in
    flashLife: 1.2,        // s a point-defence kill flash burns
    etaAlert: 45,          // s to arrival: inside this the board is an alert
    etaWarn: 120,          // s to arrival: inside this it is a warning
  };

  const SYSTEMS = ['drive', 'radiators', 'sensors', 'weapons'];
  // A beam spot is metres wide, where U.fmt.dist rounds to the nearest metre. Keep the decimals.
  const spotFmt = (m) => (m < 1000 ? U.fmt.num(m, 3) + ' m' : U.fmt.dist(m));
  const CN_WORD = { slug: '发弹丸', interceptor: '枚拦截弹', kill: '次击落' };
  const plural = (n, word) => (CN_WORD[word] ? n + ' ' + CN_WORD[word] : n + ' ' + word + (n === 1 ? '' : 's'));
  const FACET_ZH = { nose: '舰首', flank: '舷侧', tail: '舰尾', armour: '装甲', hull: '舰体' };
  const facetZh = (f) => FACET_ZH[f] || f;
  const colorOf = (ship) => (OD.Ships.FACTIONS[ship.faction] || OD.Ships.FACTIONS.CIV).color;

  // The sim the module is currently attached to. The panel calls shipReadout(ship) and
  // physicsNotes(ship, target) without a sim, so keep a handle from init().
  let simRef = null;

  // ------------------------------------------------------------------ bookkeeping
  // One record per sim: everything in flight, and the beams drawn this substep.
  function engOf(sim) {
    if (!sim.eng) {
      sim.eng = {
        beams: [],        // rebuilt every substep: {x1, y1, x2, y2, color, mounts, hit}
        slugs: [],        // coilgun slugs in flight
        interceptors: [], // interceptors under their own drives
        pd: [],           // rebuilt every substep: {x1, y1, x2, y2, color} point-defence engagements
        incoming: new Map(), // this substep's beam power per target, before vapour shielding
        flashes: [],      // point-defence kills, burning off over a second
        events: [],       // the ring the log, the sound and the threat board read
        eventSeq: 0,      // every event ever appended; events[i - eventFirst] is event i
        eventFirst: 0,
        seq: 0,           // ids for the things in flight
        rng: U.rng(20211), // deterministic: the same fight twice gives the same wreckage
        stats: newStats(),
      };
    }
    if (!sim.eng.incoming) sim.eng.incoming = new Map();
    if (!sim.eng.pd) sim.eng.pd = [];
    if (!sim.eng.flashes) sim.eng.flashes = [];
    if (!sim.eng.events) { sim.eng.events = []; sim.eng.eventSeq = 0; sim.eng.eventFirst = 0; }
    if (sim.eng.seq === undefined) sim.eng.seq = 0;
    if (!sim.eng.stats) sim.eng.stats = newStats();
    return sim.eng;
  }

  // The event ring. Everything that happens loudly enough to be worth a sound, a label or a line
  // in a debrief goes through here; nothing reads it back, so an appended event is free.
  function emit(sim, kind, pos, shipId, fromId, text) {
    const eng = engOf(sim);
    eng.events.push({ t: sim.time, kind, x: pos ? pos.x : 0, y: pos ? pos.y : 0, shipId: shipId || null, fromId: fromId || null, text: text || '' });
    eng.eventSeq++;
    while (eng.events.length > T.eventCap) { eng.events.shift(); eng.eventFirst++; }
  }
  function events(sim) {
    return sim && sim.eng ? engOf(sim).events : [];
  }
  // The tally a debrief (or the harness) reads: what was fired and what it came to.
  function newStats() {
    return { slugsFired: 0, slugHits: 0, slugMisses: 0, interceptorsLaunched: 0, interceptorHits: 0, pdKills: 0 };
  }
  // Per-ship engagement state. Ships spawned by triggers never saw init(), so stay lazy.
  function stateOf(ship) {
    if (!ship.eng) {
      const st = {
        fireMode: 'full',  // full | sustained | hold — what gunnery is allowed to spend on heat
        aim: 'hull',       // hull | radiators | drive | mounts
        aimUsed: 'hull',   // what the aim fell back to when the part was not exposed
        beamGain: 1,       // what sustained fire left the beams, 0..1
        fireFactor: null,  // what the crew on fire control were worth this update; null before the first
        mounts: 0, live: 0, inArc: 0, firing: 0, onTarget: 0, through: 0, hasTarget: false,
        reason: '', slugReason: '', facet: '', range: 0,
        pdEngaging: 0, pdKills: 0, lastBeamEvent: -1e9,
        // Our own fire, rolled up between log lines: counts since the last one, and the hull and
        // facet the last round landed on. A ship shoots at one hull at a time, so naming the last
        // one names the window. Slugs, interceptors and point-defence kills only: the beams are a
        // minute of joules (dealt, below), not a count of events. See noteLanding().
        hitLog: { t: -1e9, slug: 0, slugHeld: 0, dart: 0, pd: 0, name: '', facet: '' },
        // What lands on her, rolled up the same way and on the same gap. Beams get their own
        // minute-long line (underFire, below); this is what arrives — slugs and interceptors.
        takenLog: { t: -1e9, slug: 0, slugHeld: 0, dart: 0, name: '', facet: '' },
        // Hostile beams on her, rolled up over a minute: who is burning and for how many joules.
        // `since` is when the window opened, or -1 when nothing has landed since the last line.
        underFire: { since: -1, by: new Map() },
        // The same minute, the other way round: what this hull's beams put through hostile hulls,
        // keyed by the hull the joules went into. A bridge that only hears 'beams through her
        // flank' cannot tell whether its own fire is doing anything.
        dealt: { since: -1, to: new Map() },
        bayCap: bayCount(ship), // what she sailed with, for working out the reserve
        // The rails wait out the same gap before the first salvo as before any other, so a
        // scenario does not open with every bay in the sky before anyone has done anything.
        lastSalvo: simRef ? simRef.time : 0,
        lastAutoSaid: -1e9, // when the log last said the computer opened this hull's bays
      };
      // Fire discipline used to be one flag. Anything still reading it sees the hold mode.
      Object.defineProperty(st, 'holdBeams', {
        get() { return st.fireMode === 'hold'; },
        set(v) { st.fireMode = v ? 'hold' : 'full'; },
        enumerable: true,
      });
      ship.eng = st;
    }
    return ship.eng;
  }

  function init(sim) {
    simRef = sim;
    engOf(sim);
    for (const s of sim.ships) stateOf(s);
  }

  // ------------------------------------------------------------------ geometry and energy
  function countKind(ship, kind) {
    let n = 0;
    for (const m of ship.mounts || []) if (m.kind === kind) n++;
    return n;
  }

  // Which armour facet the shooter is looking at: the target's own heading against the bearing
  // back to the shooter. Nose within 45°, tail beyond 135°, everything else is flank.
  function facetSeen(shooter, target) {
    const rel = Math.abs(U.angleDiff(U.angleOf(U.sub(shooter.pos, target.pos)), target.heading));
    return rel < Math.PI / 4 ? 'nose' : rel > (3 * Math.PI) / 4 ? 'tail' : 'flank';
  }
  function armourCm(target, facet) {
    return (target.armour && target.armour[facet]) || 0;
  }

  // ------------------------------------------------------------------ the track under the mounts
  // Nothing here shoots at a ship: it shoots at the track its faction holds on one, and a track has
  // a quality — 1 for a contact on a bearing, 3 for a firing solution. Without the sensors module
  // every hull is held at a solution and none of this changes what the mounts do.
  function qualityStore(sim, shooter) {
    const eng = engOf(sim);
    const m = eng.trackCache || (eng.trackCache = new Map());
    let r = m.get(shooter.id);
    if (!r) { r = { time: -1, targetId: null, mod: null, q: 3 }; m.set(shooter.id, r); }
    return r;
  }
  // The shooter's faction track quality on a target. The mounts, the panel and the ladder all ask
  // for the same pair inside one substep, so the answer is kept until the substep moves on.
  function trackQuality(sim, shooter, target) {
    if (!shooter || !target || shooter === target) return 3;
    const S = window.OD.Sensors;
    if (!S || typeof S.quality !== 'function') return 3;
    const s = sim || simRef;
    if (!s) return 3;
    const rec = qualityStore(s, shooter);
    if (rec.time === s.time && rec.targetId === target.id && rec.mod === S) return rec.q;
    const q = S.quality(s, shooter, target);
    rec.time = s.time; rec.targetId = target.id; rec.mod = S;
    rec.q = typeof q === 'number' && isFinite(q) ? U.clamp(q, 1, 3) : 3;
    return rec.q;
  }
  // What a track of that quality costs the pointing. A solution costs nothing; a contact on a
  // bearing spreads the spot until the optics hardly matter.
  function trackWobble(sim, shooter, target) {
    return 1 + T.trackJitter * (3 - trackQuality(sim, shooter, target));
  }
  // Where the guns think she is going. A lead is only as good as the track's estimate of her
  // velocity, so a fuzzy track throws the round velErr × flight time wide of her.
  function estimatedVel(sim, shooter, target) {
    const S = window.OD.Sensors;
    const s = sim || simRef;
    if (S && typeof S.track === 'function' && s && shooter && target) {
      const tr = S.track(s, shooter.faction, target);
      const v = tr && tr.est && tr.est.vel;
      if (v && isFinite(v.x) && isFinite(v.y)) return v;
    }
    return target.vel;
  }
  // And how wrong that estimate is allowed to be, in m/s. The plot's own ghost is a slow bias every
  // round in a salvo shares; this is the spread around it, drawn fresh for each round, so a hull
  // that is only just a solution is shot at with a scatter of leads instead of one confident wrong
  // one. A pinned hull reads zero here and every round is aimed at the same place she will be.
  function trackVelErr(sim, shooter, target) {
    const S = window.OD.Sensors;
    const s = sim || simRef;
    if (!S || typeof S.track !== 'function' || !s || !shooter || !target) return 0;
    const tr = S.track(s, shooter.faction, target);
    const e = tr && tr.velErr;
    return typeof e === 'number' && isFinite(e) && e > 0 ? e : 0;
  }
  // Why the mounts are quiet when the sink and the fire mode would let them shoot. A gun that leads
  // a hull and a beam that holds a spot on one both need a place to put it, and short of a solution
  // (T.slugSolutionQ, the sensor module's own word for one) there is no such place: the coilguns
  // keep their rounds, the beams keep their power — nothing drawn, nothing into the sink — and the
  // readout says 'no solution'. Point defence is not on this track: it shoots at the darts coming
  // in, which it sees for itself, not at the hull that sent them.
  function solutionReason(sim, shooter, target) {
    if (!shooter || !target) return '';
    return trackQuality(sim, shooter, target) < T.slugSolutionQ ? '无解算' : '';
  }
  const slugReason = solutionReason;   // the coilguns' name for it, kept for the panel and the checks

  // ---------------------------------------------------------------- the crew on the mounts
  // Fire control is people, and the crew module prices them in one number: 1 is a full watch on a
  // ship that is not burning, 0.7 is nobody on fire control, 0.85 of that is a crew strapped in
  // under a hard burn, and experience reads above 1. With no crew module there is nobody to count,
  // the factor is 1, and every number in this file stays where it was.
  function crewFire(ship) {
    const C = window.OD.Crew;
    if (!ship || !C || typeof C.fireFactor !== 'function') return 1;
    let f = 1;
    try { f = C.fireFactor(ship); } catch (e) { return 1; }  // a crew module that throws counts as absent
    return typeof f === 'number' && isFinite(f) && f > 0 ? f : 1;
  }
  // What the mounts used this update. update() asks the crew once a ship and parks the answer on
  // the engagement state, so every mount on a hull shoots on the same number and a panel drawn
  // between updates reads what the mounts read. Before the first update nothing is parked and the
  // crew is asked directly.
  function fireFactor(ship) {
    const f = ship && ship.eng ? ship.eng.fireFactor : null;
    return typeof f === 'number' && isFinite(f) && f > 0 ? f : crewFire(ship);
  }
  // One line for the panel. Empty at 1: a full watch on a coasting ship has nothing to report.
  // Past the colon are two sentences: why the watch is off its rated value, and what that is worth
  // on a clock the bridge can check — the main mount's cycle under this watch against its rated
  // one. A percentage is an abstraction; 'every 8.6 s, not 6 s' is the round that is not there.
  // The colon stays the first one in the line: ui.js splits the row there, so the second sentence
  // rides in the value beside the first.
  function fireWords(ship) {
    const f = fireFactor(ship);
    if (!(f > 0) || Math.abs(f - 1) < 1e-9) return '';
    return '火控 ' + U.fmt.pct(f) + ': ' + fireWhy(ship, f) + cycleWords(ship, f);
  }
  // Seconds as this line reads them: one decimal while the number is small enough for one to
  // matter, whole seconds past ten, and no trailing zero on a mount that cycles in a round number.
  const cycleSecs = (s) => (s < 10 ? s.toFixed(1).replace(/\.0$/, '') : String(Math.round(s))) + ' s';
  // What the watch costs the rate of fire, from the hull's main mount: the first mount in her rack
  // with a cycle to lose, which on every stock warship is her coilgun. Only a mount that loads has
  // a rate for a watch to cost — a beam holds a spot rather than reloading, and a bay waits out a
  // doctrine gap that has a line of its own — so a rack with nothing that cycles, and a hull with
  // no mounts at all, add nothing to the line.
  function cycleWords(ship, f) {
    const rack = (ship && ship.mounts) || [];
    let m = null;
    for (let i = 0; i < rack.length; i++) {
      const c = rack[i] ? rack[i].cycle : null;
      if (typeof c === 'number' && isFinite(c) && c > 0) { m = rack[i]; break; }
    }
    if (!m || !(f > 0)) return '';
    // The mount's own name, as the rack has it, with the capital taken off for mid-sentence.
    const name = typeof m.name === 'string' && m.name ? m.name.charAt(0).toLowerCase() + m.name.slice(1) : (m.kind || 'mount');
    return ' The ' + name + ' 每 ' + cycleSecs(m.cycle / f) + ' 一发，不是 ' + cycleSecs(m.cycle) + '.';
  }
  // Why it is off 1. The crew record names the reason where there is one; a factor with no record
  // behind it says what it costs the mounts and stops there.
  function fireWhy(ship, f) {
    const c = ship ? ship.crew : null;
    const parties = c && Array.isArray(c.parties) ? c.parties : null;
    // Fire control takes its 0.85 above the couch limit, not from the working limit: a crew
    // strapped in at 1.5 g still shoots. A record with no overCouch flag falls back to strapped.
    const overCouch = c ? (c.overCouch == null ? !!c.strapped : !!c.overCouch) : false;
    if (parties && !parties.some((p) => p && p.task === 'fire')) return '没有班组负责。';
    if (c && c.total > 0 && c.fit * 3 < c.total) return '船员里能干活的不剩三分之一。';
    if (overCouch) return '船员已经超过抗荷上限。';
    if (f > 1) return '老兵船员。';
    return '炮位人手不够。';
  }

  // Pointing wobble, in radians. It buys the target nothing directly: it widens the spot,
  // and a wider spot puts less of the beam inside the cross-section it is aimed at. The track the
  // mount is shooting at widens it again: `target` is the hull being shot at, not another ship.
  // Fire control divides it: a watch worth 1.06 points 6 % tighter, and 0.7 wobbles 1 / 0.7 wider.
  function pointingJitter(ship, target) {
    const sensors = U.clamp(ship.systems ? ship.systems.sensors : 1, 0, 1);
    const blind = 1 + (1 - sensors) * (T.jitterBlind - 1);
    const burn = 1 + T.jitterBurn * U.clamp(ship.throttle || 0, 0, 1);
    return (T.jitter * blind * burn * (target ? trackWobble(simRef, ship, target) : 1)) / fireFactor(ship);
  }

  // What the reactor still gives the mounts, 0..1. Component damage sets it; without OD.Damage
  // there is nothing to cap and every mount runs at its rated power.
  function powerOf(ship) {
    const c = ship && ship.powerCap;
    return typeof c === 'number' && isFinite(c) ? U.clamp(c, 0, 1) : 1;
  }

  // What the panels can shed with the sink hot enough to work them: the ceiling, not what they
  // happen to be shedding right now. A hull's radiatorPower() follows its sink temperature, so on
  // a cold sink it reads low — which is the honest number for how fast the sink fills, and the
  // wrong one for a budget that is a steady state by definition. radiatorRating() is the hull's
  // own word for the ceiling where it has one.
  function radiatorCeiling(ship) {
    return typeof ship.radiatorRating === 'function' ? ship.radiatorRating() : ship.radiatorPower();
  }

  // What the drive is putting into the sink right now, for the three budgets below. The commanded
  // throttle is what the bridge asked for; the heat follows the thrust the drive actually makes,
  // which is that throttle after the drive's own state, the crew's acceleration cap and the
  // quarter a full sink holds her to. sim.js works that fraction out in thermal() and parks it on
  // the hull as ship.thrustFrac, so a burn capped at 0.75 by the couches is budgeted as 0.75 and
  // not as the 1 on the lever. A hull that has never been through a thermal step — an older save,
  // a hull a check built by hand — has no such number, and falls back to the commanded throttle
  // with the drive's state and the full-sink quarter on it.
  function driveHeatNow(ship) {
    if (!ship || !(ship.throttle > 0)) return 0;
    const f = ship.thrustFrac;
    if (typeof f === 'number' && isFinite(f)) return ship.driveHeat * U.clamp(f, 0, 1);
    return ship.driveHeat * ship.throttle * ship.systems.drive * (ship.overheated ? 0.25 : 1);
  }

  // Sustained fire: throttle the beams until their waste heat, the idle load and the drive fit
  // under what the radiators shed, with a margin left over. With the radiators in there is nothing
  // to fit under, so sustained means the beams stay cold.
  function sustainedScale(ship) {
    let waste = 0, bi = 0;
    const n = countKind(ship, 'beam');
    const rack = ship.mounts || [];
    for (let mi = 0; mi < rack.length; mi++) {
      const m = rack[mi];
      if (m.kind !== 'beam') continue;
      if (mountLive(ship, bi++, n, mi)) waste += m.power * (1 - m.efficiency);
    }
    if (!(waste > 0)) return 1;
    const drive = driveHeatNow(ship);
    const budget = radiatorCeiling(ship) * T.sustainMargin - ship.idleHeat - drive;
    return U.clamp(budget / waste, 0, 1);
  }
  // Everything the beams are actually running at: the fire mode, then the reactor's cap.
  function beamGain(ship) {
    const st = stateOf(ship);
    const mode = st.fireMode;
    const g = (mode === 'hold' ? 0 : mode === 'sustained' ? sustainedScale(ship) : 1) * powerOf(ship);
    st.beamGain = g;
    return g;
  }
  // The ladder shows what the mounts can do, not what discipline is letting them do: a ship with
  // its beams held still has a burn-through range, which is the whole point of reading the ladder.
  // Sustained is discipline too, and a costly thing to read as capability: a hostile who throttles
  // her beams to her radiators — or stows the panels altogether, which is exactly what she does
  // once our beams reach them — was reading as '永远打不穿：装甲太厚' on a hull she could open
  // at any moment by going to full fire and taking the cool-down afterwards. She is one button from
  // her rated power, so the rated power is what the ladder shows. The reactor's cap is not a choice
  // and stays in: a mount that has lost its power has lost its reach.
  function reachGain(ship) {
    return powerOf(ship);
  }

  // Aim points. A part that is not exposed is not an aim point: the panel says so and the mounts
  // go back to the whole cross-section.
  function aimEffective(ship, target) {
    const st = stateOf(ship);
    const want = st.aim || 'hull';
    if (!target || want === 'hull') { st.aimUsed = 'hull'; return 'hull'; }
    if (want === 'radiators' && !(target.radiators && target.radiators.state > 0.5)) { st.aimUsed = 'hull'; return 'hull'; }
    if (want === 'drive' && facetSeen(ship, target) !== 'tail') { st.aimUsed = 'hull'; return 'hull'; }
    st.aimUsed = want;
    return want;
  }
  const aimShare = (a) => T.aimShare[a] || 1;

  // What one beam mount puts on a hull at this range, before armour. `gain` is the fire mode and
  // the reactor cap; `share` is how much of the cross-section the aim point is worth.
  function beamShot(ship, mount, range, gain, share, target) {
    const R = Math.max(1, range);
    const spot = P.beamSpotDiameter(mount.wavelength, R, mount.aperture) + 2 * pointingJitter(ship, target) * R;
    const area = Math.PI * (spot / 2) * (spot / 2);
    const emitted = mount.power * mount.efficiency * (gain === undefined ? 1 : gain);
    const onTarget = emitted * Math.min(1, T.cell / Math.max(area, 1e-6)) * (share === undefined ? 1 : share);
    return { spot, area, emitted, onTarget, intensity: P.beamIntensity(emitted, spot) };
  }

  function inArc(ship, mount, bearing) {
    if (mount.arc === 'nose') return Math.abs(U.angleDiff(bearing, ship.heading)) <= T.noseArc;
    return true; // turrets bear anywhere
  }

  // Mount integrity is not a dimmer switch on every laser at once: it is how many of them still
  // answer. Damage takes mounts out one at a time, and the ones left fire at their rated power.
  // `abs` is the mount's place in ship.mounts, which is what ship.mountHp is indexed by: that array
  // is the one word on whether this mount answers, point defence included. index and count — the
  // mount's place among this hull's mounts of that kind, and how many it has — are the fallback for
  // a hull with no parts fitted, where all there is to go on is the weapons aggregate.
  function mountLive(ship, index, count, abs) {
    const i = abs != null ? abs : index;
    if (ship.mountHp) return ship.mountHp[i] > 0;
    return count > 0 && U.clamp(ship.systems.weapons, 0, 1) > index / count;
  }

  // Can this ship shoot at all, and at what?
  function engagementTarget(sim, ship) {
    if (!ship || !ship.target) return null;
    const t = sim.byId(ship.target);
    if (!t || t === ship || t.destroyed || t.captured) return null;
    if (!sim.isHostile(t, ship)) return null;
    // A cripple is a prize, not a target: the computer stops shooting and closes to board her.
    // The bridge may decide to finish her instead, so a hull under the player's hand keeps its
    // mounts on her and the panel goes on naming her.
    if (t.disabled && ship.ai) return null;
    return t;
  }

  // The same rule, on our side of the plot. A hull that is disabled, boarded or gone is out of the
  // fight, and pounding her is neither a tactic nor a thing a bridge should have to watch itself
  // do. So a ship of ours holds everything — beams, coilguns and bays — on a neutralised target,
  // and only an order names the exception: ship.finishTarget carries the hull the bridge said to
  // finish, which is what the cripple decision's 'finish' writes. The target is kept either way,
  // so the panel goes on naming her and can say why the mounts are quiet.
  const OUT_OF_FIGHT = '按住：她已退出战斗';
  function ourSide(ship) {
    if (!ship) return false;
    return simRef ? ship.faction === simRef.playerFaction : !ship.ai;
  }
  function outOfFight(target) {
    if (!target) return false;
    if (typeof target.neutralised === 'function') return !!target.neutralised();
    return !!(target.destroyed || target.disabled || target.captured);
  }
  function holdingWreck(ship, target) {
    if (!ourSide(ship) || !outOfFight(target)) return false;
    return ship.finishTarget !== target.id;
  }
  // One line per hull we stop shooting at, and one only: the bridge hears why the mounts went
  // quiet without the log filling with it. What the beams put through her in the minute before
  // that goes out first: a roll-up that arrives after the cease-fire reads as the mounts ignoring
  // the order. 'ISV Sabre 退出了战斗。按住不打。' at 1 850 s, then 'JCS Larkspur put
  // 26.6 MJ through ISV Sabre's flank this minute.' at 1 870 s.
  function noteHold(sim, ship, target) {
    const st = stateOf(ship);
    if (!st.heldSaid) st.heldSaid = {};
    if (st.heldSaid[target.id]) return;
    st.heldSaid[target.id] = true;
    flushDealtOn(sim, ship, target);
    if (sim && typeof sim.addLog === 'function') {
      sim.addLog(ship.name + ': ' + target.name + ' 退出了战斗。按住不打。', 'Gunnery', 'info');
    }
  }
  // One hull's pending minute of joules, said now instead of at the end of its window. Called
  // wherever the firing stops for good: the hull goes out of the fight, or comes apart.
  function flushDealtOn(sim, ship, target) {
    const d = ship && ship.eng && ship.eng.dealt;
    if (!sim || !d || !d.to || !target) return;
    const rec = d.to.get(target.id);
    if (rec) {
      d.to.delete(target.id);
      if (rec.j > 0 && !sim.outcome && typeof sim.addLog === 'function') {
        sim.addLog(ship.name + ' 这一分钟打穿了 ' + rec.name + ' 的' + rec.facet +
          '，输出 ' + U.fmt.energy(rec.j) + '。', 'Gunnery', 'info');
      }
    }
    if (!d.to.size) d.since = -1;
  }
  // The same, for every hull that was shooting at her.
  function flushDealtAt(sim, target) {
    if (!sim || !target) return;
    for (const ship of sim.ships) flushDealtOn(sim, ship, target);
  }

  // Why nothing at all is coming off this hull. Everything a mount needs before it may shoot.
  // The sink reserve is the beams' own discipline: a slug or a dart costs no heat, so the bays
  // and the rails ask with `skipSink`, and so does full fire — filling the sink and taking the
  // cool-down afterwards is what that mode is for.
  function fireReason(ship, target, skipSink) {
    if (ship.destroyed) return '已击毁';
    if (ship.disabled) return '失控漂流';
    if (!target) return '无目标';
    if (!ship.weaponsFree) return '火控锁定';
    if (holdingWreck(ship, target)) return OUT_OF_FIGHT;
    if (ship.weaponsInhibited) return '热沉满了';
    if (ship.systems.weapons <= 0) return '炮位报废';
    if (!skipSink && stateOf(ship).fireMode !== 'full' && !sinkMargin(ship)) return '热沉会满';
    return '';
  }
  // The beams' hold of their own. Outside the burn-through range for the facet she is showing,
  // every joule stops in her armour: the mounts draw their full power and put their waste heat
  // into the sink for nothing. So they hold, the way the coilguns hold without a solution, and the readout
  // carries the range to close to. The aim point buys no exemption from that. It used to: her
  // extended panels were read as unarmoured here, so the mounts fired at any range while fireBeams
  // went on soaking the facet's armour whatever they were aimed at. That cost 120 s of firing at
  // 889 km with 0 W through at every sample, her four panels still at hp 1.000, and our sink from
  // 29 % to 52 % (review/realism p21). A narrower aim point lands less energy, not more, so it
  // reaches less far, and reachOne already scales the emitted power by aimShare: this hold and the
  // panel's burn-through row print the same range for whatever the mounts are aimed at.
  function burnHold(sim, ship, target) {
    const s = sim || simRef;
    if (!s || !ship || !target) return '';
    // A hull with no beam left to hold is not holding: '炮位报废' and 'none fitted' are
    // other rows' business, and the ladder reads nought for both.
    const n = countKind(ship, 'beam');
    const rack = ship.mounts || [];
    let live = 0, bi = 0;
    for (let mi = 0; mi < rack.length; mi++) {
      if (rack[mi].kind !== 'beam') continue;
      if (mountLive(ship, bi++, n, mi)) live++;
    }
    if (!live) return '';
    const facet = facetSeen(ship, target);
    const range = reachOne(s, ship, target).beams[facet] || 0;
    if (range > 0 && U.dist(target.pos, ship.pos) <= range) return '';
    return range > 0
      ? '按住：已超出烧穿距离（' + U.fmt.dist(range) + '）'
      : '按住：她的' + facet + '装甲在任何距离都太厚';
  }
  // Fire discipline costs the beams nothing but heat, and a magazine is not a heat problem, so
  // held beams leave the coilguns and the bays working. The track is not one of those: short of a
  // solution the beams hold for the same reason the coilguns do, and the same two words go in the
  // readout. Out of burn-through range they hold for a reason of their own, above.
  function holdReason(ship, target, sim) {
    const st = stateOf(ship);
    if (st.fireMode === 'hold') return fireReason(ship, target) || '光束待机';
    if (st.fireMode === 'sustained' && beamGain(ship) <= 0) return fireReason(ship, target) || '持续，散热板收起';
    return fireReason(ship, target) || solutionReason(sim, ship, target) || burnHold(sim, ship, target);
  }

  // Fire discipline. A saturated sink caps the drive to a quarter and inhibits every mount, so
  // gunnery will not shoot itself into one: if firing would fill the sink inside half an hour it
  // waits for the radiators. A ship fighting with its radiators out has nothing to wait for —
  // which is the whole argument for extending them, and for how fragile that makes them.
  // `atGain` asks the question at a power the beams are not running at yet — which is how the
  // computer decides whether full fire would cook it before it commits to full fire.
  function sinkMargin(ship, atGain) {
    if (!ship.sinkCapacity) return true;
    let waste = 0, bi = 0;
    const gain = atGain === undefined ? beamGain(ship) : atGain;
    const n = countKind(ship, 'beam');
    for (let mi = 0; mi < ship.mounts.length; mi++) {
      const m = ship.mounts[mi];
      if (m.kind !== 'beam') continue;
      if (mountLive(ship, bi++, n, mi)) waste += m.power * (1 - m.efficiency) * gain;
    }
    const drive = driveHeatNow(ship);
    const net = ship.idleHeat + drive + waste - ship.radiatorPower();
    if (net <= 0) return true;
    return (ship.sinkCapacity - ship.heat) / net >= T.sinkReserve;
  }

  // What the sink is about to do, in the words the fire mode row prints. The panel's own Forecast
  // row runs the same stepped forecast (P.sinkForecast, with the radiator law's knee in it), so the
  // two lines beside each other say one thing. They did not: the row carried the fixed label
  // '全力 · 热沉会满' while the forecast beside it read 'settles near 17%', tFull null.
  function sinkWords(ship) {
    if (!ship || !(ship.sinkCapacity > 0)) return '';
    const drive = driveHeatNow(ship);
    const heatIn = ship.idleHeat + drive + (ship.lastExtraHeat || 0);
    const rating = radiatorCeiling(ship);
    let f = null;
    if (typeof P.sinkForecast === 'function') {
      try { f = P.sinkForecast(ship.heat, ship.sinkCapacity, rating, heatIn, 3600, ship.radiatorTemp); } catch (e) { f = null; }
    }
    if (f) {
      // A sink that is already full reads 'fills in 0 s', which says nothing. What it does next is
      // where it settles, and while the mounts are inhibited it is full and nothing else.
      if (f.tFull === 0 || ship.overheated) return '热沉满了';
      if (f.tFull != null && isFinite(f.tFull)) return '热沉还有 ' + U.fmt.time(f.tFull);
      if (f.tEmpty != null && isFinite(f.tEmpty) && f.tEmpty > 0 && ship.heat > 0.05 * ship.sinkCapacity) return '热沉排空还要 ' + U.fmt.time(f.tEmpty);
      if (f.settle != null && isFinite(f.settle) && f.settle < 0.999 && rating > 0) return '热沉会稳定在 ' + U.fmt.pct(f.settle);
    }
    const net = heatIn - ship.radiatorPower();
    if (net > 1e3) return '热沉还有 ' + U.fmt.time((ship.sinkCapacity - ship.heat) / net);
    if (net < -1e3 && ship.heat > 0) return '热沉排空还要 ' + U.fmt.time(ship.heat / -net);
    return '热沉保持不变';
  }

  // ------------------------------------------------------------------ shared effects
  function burst(sim, pos, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU, v = (speed || 60) * (0.3 + Math.random());
      sim.fx.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 5 + Math.random() * 7, maxLife: 12, color, size: 1 + Math.random() * 2 });
    }
  }

  // Energy that got past the armour. Every mount ends here: a beam hands over what it burned
  // through, a slug or an interceptor hands over what the plating did not eat on impact.
  function landEnergy(sim, shooter, target, joules, facet, aimAt, kind) {
    if (!(joules > 0) || target.destroyed) return;
    const D = window.OD.Damage;
    if (D && typeof D.hit === 'function') {
      // Component damage owns the hull and the systems from here: every joule past the armour is
      // handed over with the facet it came in on and what the shooter was aiming at.
      const r = D.hit(sim, target, { joules, facet: facet || 'flank', aim: aimAt || 'hull', shooter, kind: kind || 'beam' });
      if (r && r.component && (r.wrecked || r.state === 'wrecked')) {
        emit(sim, 'component', target.pos, target.id, shooter ? shooter.id : null, target.name + ': ' + (r.component.name || r.component.kind) + ' wrecked.');
      }
      checkWreck(sim, target, shooter);
      return;
    }
    const hullCap = Math.max(1, target.dryMass * T.hullJoules);
    target.hull = Math.max(0, target.hull - joules / hullCap);
    // One system takes the same hit: what the beam found under the plating is luck, unless the
    // shooter picked a part and the part was there to be hit.
    const picked = aimAt && aimAt !== 'hull' ? (aimAt === 'mounts' ? 'weapons' : aimAt) : null;
    const sys = picked && target.systems[picked] !== undefined ? picked : SYSTEMS[Math.floor(engOf(sim).rng() * SYSTEMS.length) % SYSTEMS.length];
    let share = joules / (hullCap * T.systemShare);
    if (sys === 'radiators' && target.radiators && target.radiators.state > 0.5) share *= T.radiatorExtra;
    target.systems[sys] = Math.max(0, target.systems[sys] - share);
    checkWreck(sim, target, shooter);
  }

  // `shooter` is carried through so a kill can be credited to the hull that made it.
  function checkWreck(sim, target, shooter) {
    if (target.hull <= 0 && !target.destroyed) {
      target.hull = 0;
      target.destroyed = true; target.disabled = true;
      target.throttle = 0; target.cmdThrottle = 0; target.jink = false;
      burst(sim, target.pos, 44, '#ffb454', 95);
      // What our beams put through her, before the line that says there is nothing left to put it
      // through: the roll-up is the minute that killed her, and it reads as fire after the fact.
      flushDealtAt(sim, target);
      sim.addLog(target.name + ' 解体了。舰体完整度 0 %。', 'Sensors', 'alert');
      emit(sim, 'destroyed', target.pos, target.id, shooter ? shooter.id : null, target.name + ' 解体了。');
      return;
    }
    if (!target.destroyed && !target.disabled && (target.hull < T.disableHull || target.systems.drive <= 0)) {
      target.disabled = true;
      target.throttle = 0; target.cmdThrottle = 0; target.jink = false;
      burst(sim, target.pos, 14, '#ff9f5d', 45);
      const why = target.systems.drive <= 0 ? '她的主推进器报废，正在失控漂流。'
        : '她的舰体只剩 ' + Math.round(T.disableHull * 100) + ' %，她已经停止机动。';
      flushDealtAt(sim, target);
      sim.addLog(target.name + ' 退出了战斗。' + why, 'Sensors', 'warn');
      emit(sim, 'wreck', target.pos, target.id, shooter ? shooter.id : null, target.name + ' 退出了战斗。');
    }
  }

  // ------------------------------------------------------------------ our own fire, in the log
  // The threat board is what is coming at us; the event ring is for the map and the sound. Neither
  // tells a bridge that its own rounds are landing, and a fight where the only lines are the ones
  // about being hit reads as a beating. So: one line per ship per T.hitLogGap, with everything that
  // landed inside the window counted into it — a magazine going downrange is a sentence, not a wall.
  function noteLanding(sim, shooter, target, kind, facet, through) {
    if (!sim || !shooter || !target) return;
    // Beams are left out of this window on either side. They land every substep for as long as the
    // mirror holds, so what they do is a minute of joules, not a count of events: ours go in the
    // roll-up (noteUnderFire → flushDealt), theirs in the '正被光束射击' line. Counting them
    // here as well put two lines about the same beams in the log on two windows — 'JCS Larkspur
    // put 62.5 MJ through ISV Sabre's flank this minute' at 758 s, then 'JCS Larkspur: beams
    // through ISV Sabre's nose' at 764 s, six seconds apart, on two facets, the second with no
    // number in it.
    if (kind === 'beam') return;
    // Ours landing on theirs.
    if (shooter.faction === sim.playerFaction && sim.isHostile(target, shooter)) {
      const h = stateOf(shooter).hitLog;
      if (kind === 'slug') { if (through) h.slug++; else h.slugHeld++; } else h.dart++;
      h.name = target.name;
      if (facet) h.facet = facet;
      return;
    }
    // Theirs landing on ours, on the same gap and with the same counting. What arrives — a slug,
    // an interceptor — is counted here, because a round aboard is an event and a bridge that only
    // hears about component losses is being ground down in silence.
    if (target.faction !== sim.playerFaction || !sim.isHostile(shooter, target)) return;
    const h = stateOf(target).takenLog;
    if (kind === 'slug') { if (through) h.slug++; else h.slugHeld++; } else h.dart++;
    h.name = shooter.name;
    if (facet) h.facet = facet;
  }
  // Beams grinding on a hull. A burn is not an event, it is a state, so it is rolled up by energy
  // rather than by count: who put the most through this minute, where she is putting it, and how
  // many joules it came to. Nothing landed means nothing is said. Both sides are rolled up the
  // same way — a bridge that can see what is being done to it and not what it is doing back has
  // half the fight.
  function noteUnderFire(sim, shooter, target, facet, joules) {
    if (!sim || !shooter || !target || !(joules > 0)) return;
    // Ours through theirs. The window sits on the shooter and is keyed by the hull it is burning,
    // so the joules and the facet belong to that hull and nothing is credited to the wrong one.
    if (shooter.faction === sim.playerFaction && sim.isHostile(target, shooter)) {
      const d = stateOf(shooter).dealt;
      if (!d.to) d.to = new Map();
      if (d.since < 0) d.since = sim.time;
      const held = d.to.get(target.id);
      if (held) { held.j += joules; if (facet) held.facet = facet; }
      else d.to.set(target.id, { name: target.name, j: joules, facet: facet || 'hull' });
      return;
    }
    if (target.faction !== sim.playerFaction || !sim.isHostile(shooter, target)) return;
    const u = stateOf(target).underFire;
    if (!u.by) u.by = new Map();
    if (u.since < 0) u.since = sim.time;
    const rec = u.by.get(shooter.id);
    if (rec) { rec.j += joules; if (facet) rec.facet = facet; }
    else u.by.set(shooter.id, { name: shooter.name, j: joules, facet: facet || 'hull' });
  }
  // Point defence is worth a line on either side: a dart of ours dying short of her hull is as
  // much a result as one of hers dying short of ours.
  function notePdKill(ship) {
    if (ship) stateOf(ship).hitLog.pd++;
  }
  function flushHitLogs(sim) {
    // Once the engagement is decided there is no fight left to report on. Whatever is still in
    // flight lands, but the bridge is not told about it: the counts are dropped instead.
    const decided = !!(sim && sim.outcome);
    for (const ship of sim.ships) {
      const h = ship.eng && ship.eng.hitLog;
      if (!h || !(h.slug || h.slugHeld || h.dart || h.pd)) continue;
      if (decided) { h.slug = h.slugHeld = h.dart = h.pd = 0; continue; }
      if (sim.time - h.t < T.hitLogGap) continue;
      const parts = [];
      const hull = h.name + ' 的' + facetZh(h.facet);
      // Slugs, interceptors and point-defence kills only: each one is an event with a count. What
      // the beams did this minute is the joules roll-up (flushDealt), which has the figure in it.
      if (h.slug) parts.push(plural(h.slug, 'slug') + '打穿了 ' + hull);
      if (h.slugHeld) parts.push(plural(h.slugHeld, 'slug') + '打在 ' + h.name + '，她的装甲撑住了');
      if (h.dart) parts.push(plural(h.dart, 'interceptor') + '命中了 ' + h.name);
      if (h.pd) parts.push('点防御拦掉 ' + plural(h.pd, 'interceptor'));
      h.slug = h.slugHeld = h.dart = h.pd = 0;
      if (!parts.length) continue;
      h.t = sim.time;
      sim.addLog(ship.name + ': ' + parts.join(', ') + '.', 'Gunnery', 'info');
    }
    flushTakenLogs(sim, decided);
  }
  // The same window, the other way round: what arrived aboard one of ours since the last line.
  function flushTakenLogs(sim, decided) {
    for (const ship of sim.ships) {
      const h = ship.eng && ship.eng.takenLog;
      if (!h || !(h.slug || h.slugHeld || h.dart)) continue;
      if (decided) { h.slug = h.slugHeld = h.dart = 0; continue; }
      if (sim.time - h.t < T.hitLogGap) continue;
      h.t = sim.time;
      const parts = [];
      if (h.slug) parts.push(plural(h.slug, 'slug') + '打穿了她的' + facetZh(h.facet || 'armour'));
      if (h.slugHeld) parts.push(plural(h.slugHeld, 'slug') + ' 被她的装甲挡住');
      if (h.dart) parts.push(plural(h.dart, 'interceptor') + '命中');
      h.slug = h.slugHeld = h.dart = 0;
      sim.addLog(ship.name + ' 承受了 ' + parts.join('、') + (h.name ? '，来自 ' + h.name : '') + '。', 'Gunnery', 'warn');
    }
  }
  // One line a minute for a hull under beams, and none at all for a hull nobody is burning. The
  // window opens on the first joule that lands and closes T.underFireGap later, whether or not the
  // fire kept up, so a burst that stopped is still reported once and never twice.
  function flushUnderFire(sim) {
    const decided = !!(sim && sim.outcome);
    for (const ship of sim.ships) {
      const u = ship.eng && ship.eng.underFire;
      if (!u || u.since < 0) continue;
      // A hull that has come apart is not under fire; the sim has already said what became of her.
      if (decided || ship.destroyed) { u.since = -1; if (u.by) u.by.clear(); continue; }
      if (sim.time - u.since < T.underFireGap) continue;
      let top = null, total = 0;
      if (u.by) for (const rec of u.by.values()) { total += rec.j; if (!top || rec.j > top.j) top = rec; }
      u.since = -1;
      if (u.by) u.by.clear();
      if (!top || !(total > 0)) continue;
      // The hull is named because a squadron has more than one of ours taking fire at once, and
      // 'our flank' on its own tells a three-a-side bridge nothing about whose flank it is.
      sim.addLog(ship.name + ' 的舰体正被光束打 ' + top.facet + '。' + top.name +
        ' 这一分钟打出了 ' + U.fmt.energy(total) + '。', 'Gunnery', 'warn');
    }
  }

  // What our beams put through her, on the same minute. '光束打穿她的舷侧' says the mirror
  // is holding; this says what it came to, so the bridge can tell a burn that is working from one
  // that is not.
  function flushDealt(sim) {
    const decided = !!(sim && sim.outcome);
    for (const ship of sim.ships) {
      const d = ship.eng && ship.eng.dealt;
      if (!d || d.since < 0) continue;
      if (decided) { d.since = -1; if (d.to) d.to.clear(); continue; }
      if (sim.time - d.since < T.underFireGap) continue;
      d.since = -1;
      if (!d.to) continue;
      for (const rec of d.to.values()) {
        if (!(rec.j > 0)) continue;
        sim.addLog(ship.name + ' 这一分钟打穿了 ' + rec.name + ' 的' + rec.facet +
          '，输出 ' + U.fmt.energy(rec.j) + '。', 'Gunnery', 'info');
      }
      d.to.clear();
    }
  }

  // ------------------------------------------------------------------ beams
  function fireBeams(sim, ship, target, dt, eng) {
    const st = stateOf(ship);
    const R = Math.max(1, U.dist(target.pos, ship.pos));
    const bearing = U.angleOf(U.sub(target.pos, ship.pos));
    const facet = facetSeen(ship, target);
    const soak = T.armourWatts * armourCm(target, facet);
    const gain = beamGain(ship);
    const aimAt = aimEffective(ship, target);
    const share = aimShare(aimAt);
    let firing = 0, onTarget = 0, through = 0, bi = 0;
    const nBeams = st.mounts || countKind(ship, 'beam');
    for (let mi = 0; mi < ship.mounts.length; mi++) {
      const m = ship.mounts[mi];
      if (m.kind !== 'beam') continue;
      const live = mountLive(ship, bi++, nBeams, mi);
      if (!live || !inArc(ship, m, bearing)) continue;
      const shot = beamShot(ship, m, R, gain, share, target);
      firing++;
      onTarget += shot.onTarget;
      through += Math.max(0, shot.onTarget - soak);
      // Every firing mount dumps its inefficiency into the sink whether or not it hurts anyone.
      ship.extraHeat = (ship.extraHeat || 0) + m.power * (1 - m.efficiency) * gain;
    }
    st.firing = firing; st.onTarget = onTarget; st.through = through; st.facet = facet; st.range = R;
    if (!firing) return;
    if (through > 0) {
      // Keyed by the facet as well as the hull: two shooters on different bearings burn two
      // different sides, and each one's joules have to land on the plating it crossed for.
      const key = target.id + '|' + facet;
      const rec = eng.incoming.get(key);
      if (rec) rec.watts += through;
      else eng.incoming.set(key, { target, watts: through, shooter: ship, facet, aim: aimAt });
    }
    // from and to are the two hulls, so the renderer can start the segment at the firing mount's
    // muzzle and end it on her plating once both are drawn at art size.
    eng.beams.push({ x1: ship.pos.x, y1: ship.pos.y, x2: target.pos.x, y2: target.pos.y, color: colorOf(ship), mounts: firing, hit: through > 0, from: ship.id, to: target.id });
  }

  // Vapour shielding. The plume a beam blows off the armour absorbs what comes after it, so a
  // hull soaks the first megawatts nearly in full and the rest with sharply falling returns.
  // Four lasers on one corvette are worth far less than four times one; spreading fire pays.
  function plumeSaturation(target) {
    const L = Math.max(20, target.length || 100);
    return T.plumeWatts * (L / 100) * (L / 100);
  }
  function landIncoming(sim, eng, dt) {
    if (!eng.incoming.size) return;
    // The vapour belongs to the hull, not to one bearing: saturate everything falling on her
    // together, then give each facet its share of what got through.
    const totals = eng.beamTotals || (eng.beamTotals = new Map());
    totals.clear();
    for (const rec of eng.incoming.values()) totals.set(rec.target, (totals.get(rec.target) || 0) + rec.watts);
    for (const rec of eng.incoming.values()) {
      const target = rec.target;
      const sat = plumeSaturation(target);
      const total = totals.get(target) || rec.watts;
      const joules = sat * Math.tanh(total / sat) * dt * (rec.watts / total);
      // One line per hull, not one per substep: a broadside is a texture, not a strobe.
      const st = stateOf(target);
      if (joules > 0 && sim.time - st.lastBeamEvent >= T.beamEventGap) {
        st.lastBeamEvent = sim.time;
        emit(sim, 'through', target.pos, target.id, rec.shooter ? rec.shooter.id : null,
          (rec.shooter ? rec.shooter.name + ' 正在烧穿 ' : '有什么正在烧穿 ') + target.name + '’s ' + rec.facet + '.');
        noteLanding(sim, rec.shooter, target, 'beam', rec.facet, true);
      }
      noteUnderFire(sim, rec.shooter, target, rec.facet, joules);
      landEnergy(sim, rec.shooter, target, joules, rec.facet, rec.aim, 'beam');
    }
    eng.incoming.clear();
  }

  // What a ship's beams would do right now, for the panel and the physics notes.
  function assess(sim, ship) {
    const st = stateOf(ship);
    st.mounts = countKind(ship, 'beam');
    st.inArc = 0; st.live = 0;
    const target = sim ? engagementTarget(sim, ship) : null;
    st.reason = holdReason(ship, target, sim);
    st.slugReason = countKind(ship, 'coilgun') ? solutionReason(sim, ship, target) : '';
    st.hasTarget = !!target;
    // How many mounts still answer is a fact about the hull, not about the target: count them
    // whether or not there is anything to shoot at, or a ship with nothing on the plot reads to
    // the panel as a ship with its mounts shot off.
    const R = target ? Math.max(1, U.dist(target.pos, ship.pos)) : 0;
    const bearing = target ? U.angleOf(U.sub(target.pos, ship.pos)) : 0;
    const facet = target ? facetSeen(ship, target) : '';
    const soak = target ? T.armourWatts * armourCm(target, facet) : 0;
    const gain = beamGain(ship);
    const share = aimShare(aimEffective(ship, target));
    let onTarget = 0, through = 0, bi = 0;
    const rack = ship.mounts || [];
    for (let mi = 0; mi < rack.length; mi++) {
      const m = rack[mi];
      if (m.kind !== 'beam') continue;
      const live = mountLive(ship, bi++, st.mounts, mi);
      if (live) st.live++;
      if (!target || !live || !inArc(ship, m, bearing)) continue;
      st.inArc++;
      const shot = beamShot(ship, m, R, gain, share, target);
      onTarget += shot.onTarget;
      through += Math.max(0, shot.onTarget - soak);
    }
    st.onTarget = onTarget; st.through = through;
    if (!target || !st.mounts) { st.firing = 0; st.range = 0; return st; }
    st.facet = facet; st.range = R;
    if (st.reason) st.firing = 0;
    return st;
  }

  // ------------------------------------------------------------------ update
  function update(sim, dt) {
    simRef = sim;
    const eng = engOf(sim);
    eng.beams.length = 0;
    eng.incoming.clear();
    for (const ship of sim.ships) {
      const st = stateOf(ship);
      st.fireFactor = crewFire(ship); // one read a ship a update: the mounts and the panel share it
      st.mounts = countKind(ship, 'beam');
      st.inArc = 0; st.live = 0; st.firing = 0; st.onTarget = 0; st.through = 0;
      if (ship.destroyed) continue;
      tickMounts(ship, dt); // coilgun cycles run down whether or not gunnery is allowed to shoot
      const target = engagementTarget(sim, ship);
      if (onDoctrine(ship)) aiDiscipline(sim, ship, target);
      st.reason = holdReason(ship, target, sim);
      st.hasTarget = !!target;
      // How many mounts answer is a fact about the hull, so it is counted before any reason to
      // hold fire; what bears is a fact about the bearing, so it needs something to bear on.
      const bearing = target ? U.angleOf(U.sub(target.pos, ship.pos)) : 0;
      let bi = 0;
      for (let mi = 0; mi < (ship.mounts || []).length; mi++) {
        const m = ship.mounts[mi];
        if (m.kind !== 'beam') continue;
        const live = mountLive(ship, bi++, st.mounts, mi);
        if (live) st.live++;
        if (target && live && inArc(ship, m, bearing)) st.inArc++;
      }
      const why = fireReason(ship, target);
      // She is out of the fight and nobody has said to finish her: say so once, then hold.
      if (why === OUT_OF_FIGHT) noteHold(sim, ship, target);
      if (why || !target) continue;
      // Short of a solution nothing that has to be aimed at a place fires, and nothing fires at
      // a facet it cannot open at this range either: the mirrors stay cold, so no power is drawn
      // and no waste heat goes into the sink to be seen by.
      const beamsHold = !!(solutionReason(sim, ship, target) || burnHold(sim, ship, target));
      if (st.mounts && beamGain(ship) > 0 && !beamsHold) fireBeams(sim, ship, target, dt, eng);
      fireCoilguns(sim, ship, target, dt, eng);
      launchInterceptors(sim, ship, target, dt, eng);
    }
    landIncoming(sim, eng, dt);
    updateSlugs(sim, dt, eng);
    // Point defence shoots at the range the interceptors are at now, then they close: a dart that
    // dies this substep never gets its last three kilometres.
    updatePointDefence(sim, dt, eng);
    updateInterceptors(sim, dt, eng);
    ageFlashes(eng, dt);
    flushHitLogs(sim);
    flushUnderFire(sim);
    flushDealt(sim);
  }

  // Whose bays the computer opens. Every AI hull, and any hull of ours the shell has handed to
  // the computer: the player commands one ship at a time, and main.js sets ship.autoBays on every
  // other player ship that is weapons free (Game.handBays), clearing it on the one being
  // commanded. A fleet where only the flagship ever launched was the balance probe's asymmetry:
  // the computer emptied every bay on its side while our other hulls sailed with full rails.
  // It is the launch doctrine alone: see aiDiscipline for what our hulls do not take.
  const onDoctrine = (ship) => !!(ship && (ship.ai || ship.autoBays === true));

  // The computer flies the same controls the panel does. It throttles its beams once the sink is
  // past its margin or it is fighting with the radiators in, and it goes for the radiator panels
  // whenever they are out and inside the range its beams open a flank at.
  // It shoots on the same track the player does, and on the same numbers: the ladder it reads its
  // aim point off already carries the wobble a poor track adds, its beams and its coilguns alike
  // hold without a solution (T.slugSolutionQ) and its bays wait for a track (T.salvoTrackQ).
  // None of it runs on a hull of ours. What an autoBays hull takes from the computer is the launch
  // doctrine and nothing else: the fire mode, the panels and the aim point are all things the
  // decision layer already puts to the bridge, card by card, on every player ship. Writing them
  // back every substep was the doctrine arguing with the player — a hull told to go cold was
  // firing again before the answer had settled, and a hull the aim card had pointed at a drive was
  // back on her hull a frame later.
  function aiDiscipline(sim, ship, target) {
    if (!ship.ai && !!(sim && ship.faction === sim.playerFaction)) return;
    const st = stateOf(ship);
    const load = ship.sinkCapacity ? ship.heat / ship.sinkCapacity : 0;
    if (!target) { st.fireMode = 'full'; st.aim = 'hull'; return; }
    const tight = load > T.aiSustainLoad || (ship.radiators.state < 0.5 && !sinkMargin(ship, powerOf(ship)));
    // Sustained with the panels in is not discipline, it is silence: there is nothing for the beams
    // to fit under, the throttle goes to zero and the mounts never fire again — which is how a
    // corvette that stowed her radiators because our beams were on them spent the rest of a fight
    // reading '永远打不穿：装甲太厚' and never touching us. A computer that has put its panels
    // away and still wants the target dead shoots at full and takes the cool-down afterwards,
    // which is the whole point of full fire.
    st.fireMode = tight && sustainedScale(ship) > 0 ? 'sustained' : 'full';
    let want = 'hull';
    if (target.radiators && target.radiators.state > 0.5) {
      // ask what the narrower aim buys, not what the whole cross-section would
      st.aim = 'radiators';
      const r = reachOne(sim, ship, target);
      if (r.beams.flank > 0 && U.dist(ship.pos, target.pos) <= r.beams.flank) want = 'radiators';
    }
    st.aim = want;
  }

  function ageFlashes(eng, dt) {
    const f = eng.flashes;
    for (let i = f.length - 1; i >= 0; i--) {
      f[i].life -= dt;
      if (f[i].life <= 0) f.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ render
  // Nothing below this line touches the fight; it only decides what the fight looks like. The
  // module draws after the hulls are down, additively, so every glow sits on top of the plating it
  // is burning through. Widths and radii are in screen pixels on purpose: a laser is a line of
  // light, not an object with a size, and a slug is three centimetres of iron that would be
  // invisible at any honest scale. Distances come from cam.zoom; brightness does not.

  // A ship on fire is one thing; a strobing screen is another. When the system asks for less
  // motion the effects keep their brightness and lose their flicker.
  let motionQ = null, motionAsked = false;
  function reducedMotion() {
    if (!motionAsked) {
      motionAsked = true;
      try { motionQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { motionQ = null; }
    }
    return !!(motionQ && motionQ.matches);
  }

  // Colour. OD.Render.hexA is fine for a one-off stroke; these keep the parse out of the
  // per-particle loop and give us the white-hot end of a faction tint, which is what the inside of
  // a beam actually looks like: the colour belongs to the glow, the core is nearly white.
  const rgbCache = new Map();
  function rgbOf(hex) {
    let c = rgbCache.get(hex);
    if (c) return c;
    c = { r: 255, g: 255, b: 255 };
    if (typeof hex === 'string' && hex.charAt(0) === '#') {
      const n = parseInt(hex.slice(1), 16);
      if (isFinite(n)) c = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    rgbCache.set(hex, c);
    return c;
  }
  const clamp01 = (a) => (a > 0 ? (a < 1 ? a : 1) : 0);
  function rgba(hex, a) {
    const c = rgbOf(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + clamp01(a) + ')';
  }
  // t = 0 is the faction colour; t = 1 is the inside of the beam.
  function hot(hex, t, a) {
    const c = rgbOf(hex);
    const f = (v) => Math.round(v + (255 - v) * t);
    return 'rgba(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ',' + clamp01(a) + ')';
  }
  // A soft round bloom. One gradient, no offscreen canvas, additive like everything else here.
  // It is kept for the place a beam lands and nowhere else: a gradient is an object, and a
  // hundred objects a frame is a pause in the middle of a broadside.
  function spot(ctx, x, y, r, color, a) {
    if (!(r > 0.4) || !(a > 0.004)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.45, rgba(color, a * 0.35));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.fill();
  }
  // The same bloom for everywhere else: four discs stacked additively. Against a background this
  // dark the steps do not read, and nothing is allocated to draw it.
  const BLOOM = [1, 0.7, 0.45, 0.24];
  function bloom(ctx, x, y, r, color, a) {
    if (!(r > 0.4) || !(a > 0.004)) return;
    ctx.fillStyle = rgba(color, a * 0.34);
    for (let i = 0; i < BLOOM.length; i++) {
      ctx.beginPath(); ctx.arc(x, y, r * BLOOM[i], 0, U.TAU); ctx.fill();
    }
  }

  function firstNum() {
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (typeof v === 'number' && isFinite(v)) return v;
    }
    return null;
  }
  // How hard this beam is running, 0..1. A beam record only has to carry its two ends and a
  // colour; if whatever pushed it also put a reading on it — a bare number, a life against a
  // maxLife, or a little state object off the mount — the glow reads from that instead, and a beam
  // that has been switched off draws nothing at all.
  function beamLevel(b) {
    let v = null;
    const st = b.state;
    if (st !== null && st !== undefined) {
      if (typeof st === 'number') v = st;
      else if (typeof st === 'object') {
        if (st.on === false || st.firing === false || st.active === false) return 0;
        v = firstNum(st.intensity, st.level, st.strength, st.alpha, st.charge, st.power);
      }
    }
    if (v === null) v = firstNum(b.intensity, b.level, b.strength, b.alpha, b.fade);
    if (v === null) v = 1;
    if (typeof b.life === 'number' && b.maxLife > 0) v *= b.life / b.maxLife;
    return clamp01(v);
  }

  function render(ctx, cam, sim) {
    const eng = sim && sim.eng;
    if (!eng) return;
    const frame = OD.Render.frame();
    const calm = reducedMotion();
    renderBeams(ctx, cam, eng, frame, calm, sim);
    renderSlugs(ctx, cam, eng);
    renderInterceptors(ctx, cam, eng, frame, calm);
    renderFlashes(ctx, cam, eng);
  }

  // A point-defence kill: a small flash where the interceptor was, gone in a second.
  function renderFlashes(ctx, cam, eng) {
    const f = eng.flashes;
    if (!f || !f.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < f.length; i++) {
      const e = f[i];
      const p = cam.toScreen(e);
      if (!onScreen(p, cam, 40)) continue;
      const k = U.clamp(e.life / e.maxLife, 0, 1);
      bloom(ctx, p.x, p.y, 3 + 11 * (1 - k), e.color, 0.55 * k);
      ctx.strokeStyle = hot(e.color, 0.8, 0.5 * k);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 + 14 * (1 - k), 0, U.TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // A beam is three strokes and two blooms: a wide soft column of light that carries the faction
  // colour, a thin nearly-white thread inside it doing the actual work, a flare at the mirror and
  // a hot spot where it lands. Mounts firing together widen it; armour that eats the whole shot
  // leaves the column without its landing spot, which is exactly what it should look like.
  //
  // The record carries both hulls, so at close zoom the light leaves the muzzle of every mount
  // that is firing and stops on the target's plating. Both ends fall back to the hull's centre
  // when there is no art to hang them on, which is what the map drew before there was any.
  const beamStart = [];   // render scratch: one { x, y, n } per start point, rebuilt per record
  function startAt(i, x, y, n) {
    const q = beamStart[i] || (beamStart[i] = { x: 0, y: 0, n: 1 });
    q.x = x; q.y = y; q.n = n;
    return q;
  }
  // Half the target hull's screen extent along the beam, so the spot sits on her plating instead
  // of her centre. An icon has no extent and keeps the centre it always had.
  function hullEdgeOf(sim, cam, id, ux, uy) {
    const R = OD.Render;
    if (!sim || id == null || !R || typeof R.hullEdge !== 'function' || typeof sim.byId !== 'function') return 0;
    const target = sim.byId(id);
    if (!target) return 0;
    let e = 0;
    try { e = R.hullEdge(cam, target, ux, uy); } catch (err) { e = 0; }
    return isFinite(e) && e > 0 ? e : 0;
  }
  // The muzzles this record is coming off, into beamStart, and how many there are. artFx names the
  // mounts that fired this substep; OD.Render.muzzleOf puts each one on screen while the hull is
  // drawn at art size and hands back null for an icon, for art that is not loaded and for a mount
  // on the far side. Every mount it cannot place goes back to the centre, and the ones that share
  // the centre share one segment: `n` is how many mounts a start point is drawing for, which is
  // what sets the width.
  function beamStarts(sim, cam, b, centre, mounts) {
    const R = OD.Render;
    const ship = sim && b.from != null && typeof sim.byId === 'function' ? sim.byId(b.from) : null;
    let found = 0, placed = 0, middle = 0;
    if (ship && R && typeof R.muzzleOf === 'function') {
      let fx = null;
      try { fx = artFx(ship, sim); } catch (e) { fx = null; }
      const rack = (fx && fx.mounts) || EMPTY;
      for (let i = 0; i < rack.length; i++) {
        const m = rack[i];
        if (!m || m.kind !== 'beam') continue;
        found++;
        let q = null;
        try { q = R.muzzleOf(sim, cam, ship, m); } catch (e) { q = null; }
        if (q && isFinite(q.x) && isFinite(q.y)) startAt(placed++, q.x, q.y, 1);
        else middle++;
      }
    }
    if (!found || !placed) { startAt(0, centre.x, centre.y, mounts); return 1; }
    if (middle > 0) startAt(placed++, centre.x, centre.y, middle);
    return placed;
  }
  function renderBeams(ctx, cam, eng, frame, calm, sim) {
    const beams = eng.beams;
    if (!beams || !beams.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i];
      const k = beamLevel(b);
      if (k <= 0.02) continue;
      const a = cam.toScreen({ x: b.x1, y: b.y1 });
      const c = cam.toScreen({ x: b.x2, y: b.y2 });
      // cheap cull: the segment's bounding box against the viewport
      if (Math.min(a.x, c.x) > cam.w + 40 || Math.max(a.x, c.x) < -40 || Math.min(a.y, c.y) > cam.h + 40 || Math.max(a.y, c.y) < -40) continue;
      // Out of phase with its neighbours, so a broadside shimmers instead of strobing.
      const lvl = k * (calm ? 1 : 0.88 + 0.12 * Math.sin(frame * 0.7 + i * 2.3));
      const mounts = Math.max(1, b.mounts || 1);
      // Where it lands: her plating, along the line between the hulls.
      let ex = c.x, ey = c.y;
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d > 1) {
        const ux = dx / d, uy = dy / d;
        const edge = Math.min(hullEdgeOf(sim, cam, b.to, ux, uy), d * 0.9);
        if (edge > 0) { ex -= ux * edge; ey -= uy * edge; }
      }
      const starts = beamStarts(sim, cam, b, a, mounts);
      for (let j = 0; j < starts; j++) {
        const q = beamStart[j];
        const w = Math.min(3.4, 1.1 + q.n * 0.45);
        const len = Math.hypot(ex - q.x, ey - q.y);
        ctx.lineCap = 'butt';
        // The soft column of light. One gradient down the axis, so it gathers toward the hull it
        // is standing on instead of lying flat from end to end — the only place in here that
        // allocates anything per frame, and there are never more beams than there are mounts
        // pointed at you.
        const g = ctx.createLinearGradient(q.x, q.y, ex, ey);
        g.addColorStop(0, rgba(b.color, 0.03 * lvl));
        g.addColorStop(0.09, rgba(b.color, 0.13 * lvl));
        g.addColorStop(0.7, rgba(b.color, 0.16 * lvl));
        g.addColorStop(1, rgba(b.color, 0.26 * lvl));
        ctx.strokeStyle = g;
        ctx.lineWidth = w * 9;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = rgba(b.color, 0.18 * lvl);
        ctx.lineWidth = w * 3.2;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = rgba(b.color, 0.24 * lvl);
        ctx.lineWidth = w * 1.2;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.lineCap = 'round';
        ctx.strokeStyle = hot(b.color, 0.62, (b.hit ? 0.92 : 0.58) * lvl);
        ctx.lineWidth = Math.max(0.7, w * 0.42);
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(ex, ey); ctx.stroke();
        // the mirror it left
        if (len > 5) bloom(ctx, q.x, q.y, (2.4 + q.n * 0.6) * lvl, b.color, 0.5 * lvl);
      }
      // and the hull it found: one spot, whatever the mounts converged from
      if (b.hit) {
        const pulse = calm ? 1 : 0.9 + 0.2 * Math.sin(frame * 0.9 + i * 1.7);
        const r = (4 + mounts * 1.5) * pulse;
        spot(ctx, ex, ey, r * 2.8, b.color, 0.42 * k);
        bloom(ctx, ex, ey, r * 1.1, b.color, 0.5 * k);
        ctx.fillStyle = hot(b.color, 0.95, 0.9 * k);
        ctx.beginPath(); ctx.arc(ex, ey, Math.max(0.9, r * 0.3), 0, U.TAU); ctx.fill();
        // four short lances of glare off the hot spot: the only thing on screen that says the
        // armour is not winning this one.
        ctx.strokeStyle = hot(b.color, 0.7, 0.3 * lvl);
        ctx.lineWidth = 1;
        const sp = r * 2.8, ph = calm ? 0 : 0.25 * Math.sin(frame * 0.15 + i);
        ctx.beginPath();
        for (let q2 = 0; q2 < 4; q2++) {
          const ang = ph + (q2 * Math.PI) / 2;
          const ux = Math.cos(ang), uy = Math.sin(ang);
          ctx.moveTo(ex + ux * r * 0.35, ey + uy * r * 0.35);
          ctx.lineTo(ex + ux * sp, ey + uy * sp);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ panel
  function shipReadout(ship) {
    if (!ship) return [];
    const sim = simRef;
    const eng = sim && sim.eng;
    const st = assess(sim, ship);
    const rows = [];
    if (!st.mounts) rows.push({ label: '光束', value: '未安装', tip: '这型舰体没有激光炮位。' });
    else {
      // Nothing bears on nothing: with no target there is no bearing to be in the arc of, and the
      // row says so rather than printing a nought that reads as a fault. Wrecked is only ever the
      // mounts that are actually wrecked.
      const out = st.mounts - st.live;
      rows.push({
        label: '射界内光束',
        value: (st.hasTarget ? st.inArc + ' / ' + st.mounts : '无目标 · ' + st.mounts + ' 座炮位') + (out > 0 ? ' · 报废 ' + out + ' 座' : ''),
        tip: '轴射炮位只能打舰首正负 10° 以内。炮塔可以打任意方位。',
      });
      if (st.reason) rows.push({
        label: '状态',
        value: st.reason,
        tip: st.reason === '无解算'
          ? '光束需要 ' + T.slugSolutionQ + ' 的跟踪质量才能把光斑压在她舰体的同一块上。低于这个值炮位就按住不打，不耗电也不产热。点防御照常开火。'
          : /burn-through range|armour is too thick/.test(st.reason)
            ? '光束为什么没开火。' + THROTTLE_TIP
            : '光束为什么没开火。',
      });
      else if (!st.inArc) rows.push({ label: '状态', value: '没有炮位对得上', tip: '把舰首转到目标的方位上。' });
      else {
        rows.push({ label: '命中', value: U.fmt.power(st.onTarget) + '，距离 ' + U.fmt.dist(st.range), tip: '在这个距离上，光束落进她舰体 ' + T.cell + ' 平方米一块区域内的功率。' + THROTTLE_TIP });
        rows.push({ label: '穿甲', value: st.through > 0 ? U.fmt.power(st.through) + ' · 她的' + st.facet : '打不穿 · 她的' + st.facet, tip: '能穿过她装甲的功率。其余都被她朝我们的那一面吸收掉。' });
      }
    }
    const coils = countKind(ship, 'coilgun');
    if (coils) {
      const rounds = magazine(ship);
      const why = st.slugReason;
      rows.push({
        label: '剩余弹丸',
        value: (rounds ? rounds + ' 发 · ' + coils + ' 个弹仓' : '弹仓已空') + (why ? ' · ' + why : ''),
        tip: why
          ? '线圈炮是朝“跟踪所说的、弹丸到达时她会在的位置”打的。跟踪质量低于 ' + T.slugSolutionQ + ' 就没有这个位置，炮位只能按住。'
          : '弹仓里剩下的弹丸。只要光束能打，线圈炮就按自己的节奏开火。',
      });
    }
    const bays = countKind(ship, 'launcher');
    if (bays) {
      const left = bayCount(ship);
      rows.push({ label: '剩余拦截弹', value: left ? left + ' 枚 · ' + bays + ' 个发射舱' : '发射舱已空', tip: '一个发射舱一次齐射就打空。战斗中没有任何东西会给发射导轨装填。' });
    }
    // Fire discipline and aim, in the same two rows whatever the hull carries.
    if (st.mounts) {
      const mode = st.fireMode;
      const g = beamGain(ship);
      // Full fire is the one mode whose heat is not settled by construction, so it carries the
      // live forecast instead of a label: what this ship's sink does at the heat it is making now.
      const sink = sinkWords(ship);
      rows.push({
        label: '开火模式',
        value: mode === 'full' ? '全力' + (sink ? ' · ' + sink : '') : mode === 'hold' ? '待机 · 光束冷却' : '持续 · 光束 ' + Math.round(g * 100) + ' %',
        tip: '全力让每门光束都开火，热沉很快灌满。持续把光束压到散热板排得掉的程度，热沉就稳在原地。待机让光束冷着，线圈炮和发射舱照常开火。',
      });
      const target = sim ? engagementTarget(sim, ship) : null;
      rows.push({ label: '瞄准', value: aimLabel(ship, target), tip: '瞄准部位越小，接住的光斑就越少。打一个部件打进她的能量，比打整个舰体少。' });
    }
    const pdr = pdReport(ship);
    if (pdr.mounts) {
      rows.push({
        label: '点防御',
        value: pdr.live + ' / ' + pdr.mounts + ' 门可用 · 正在打 ' + pdr.engaging + ' · 击落 ' + plural(pdr.kills, 'kill'),
        tip: '点防御炮位会打 ' + U.fmt.dist(T.pdRange) + ' 内飞来的拦截弹，每分钟大约拦掉 ' + U.fmt.num(pdr.ratePerMin, 2) + ' 枚。',
      });
    }
    const board = threatSummary(sim, ship);
    const near = inbound(sim, ship);
    rows.push({ label: '来袭', value: near || board.slugs ? board.text : '没有来袭', tip: '朝这艘舰飞来的东西，以及点防御能拦掉多少。' });
    const slugs = eng ? eng.slugs.length : 0;
    const darts = eng ? eng.interceptors.length : 0;
    rows.push({ label: '效果', value: (eng ? eng.beams.length : 0) + ' 道光束 · ' + slugs + ' 发弹丸 · ' + darts + ' 枚拦截弹', tip: '此刻正在开火的光束，以及正在飞行的弹丸和拦截弹，双方都算在内。' });
    return rows;
  }

  // The three trades the panel offers: what the beams may spend on heat, what they are aiming at,
  // and how much of the bay goes out at once. Every tip carries the number that makes it a choice.
  const SALVOS = [['launch2', 2, 'Launch 2'], ['launch4', 4, 'Launch 4']];
  function panelActions(ship) {
    if (!ship) return [];
    const acts = [];
    const st = stateOf(ship);
    if (countKind(ship, 'beam')) {
      const g = sustainedScale(ship);
      acts.push({ id: 'fire_full', label: '全力', tip: '每门光束都是满功率，热沉会灌满。热沉满了，推进器只剩四分之一，所有炮位停火——包括点防御——直到它排空。', active: st.fireMode === 'full' });
      acts.push({ id: 'fire_sustained', label: '持续', tip: g > 0 ? '光束压到额定功率的 ' + Math.round(g * 100) + ' %。散热板正好能排掉这些废热，热沉就不会满。' : '散热板收着，没有东西排热。持续模式会让光束一直冷着，直到把板子展开。', active: st.fireMode === 'sustained' });
      acts.push({ id: 'fire_hold', label: '光束待机', tip: '光束冷着，但没有进入火控锁定。线圈炮和发射舱照常开火。', active: st.fireMode === 'hold' });
      const target = simRef ? engagementTarget(simRef, ship) : null;
      const rads = !!(target && target.radiators && target.radiators.state > 0.5);
      const tail = !!(target && facetSeen(ship, target) === 'tail');
      acts.push({ id: 'aim_hull', label: '瞄准舰体', tip: '整个舰体。这是最大的瞄准面，100 % 的能量都打在目标上。', active: st.aim === 'hull' });
      acts.push({ id: 'aim_radiators', label: '瞄准散热板', tip: rads ? '她的散热板展开着。打掉它们，她就排不出热；代价是只有 ' + Math.round(T.aimShare.radiators * 100) + ' % 的能量落在目标上。这么小的瞄准面，烧穿距离更短，靠近了再选。' : '她的散热板收着。外面没有东西可打，光束会落回舰体。', active: st.aim === 'radiators' });
      acts.push({ id: 'aim_drive', label: '瞄准推进器', tip: tail ? '她把舰尾对着我们。打掉推进器，她就没法机动；代价是只有 ' + Math.round(T.aimShare.drive * 100) + ' % 的能量落在目标上。' : '推进器只有从舰尾才露出来。从其他任何一面看，光束都会落回舰体。', active: st.aim === 'drive' });
      acts.push({ id: 'aim_mounts', label: '瞄准炮位', tip: '一个一个打掉她的炮位；只有 ' + Math.round(T.aimShare.mounts * 100) + ' % 的能量落在目标上。', active: st.aim === 'mounts' });
    }
    // Offered only when there is something to launch and something to launch it at.
    const left = bayCount(ship);
    const target = simRef ? engagementTarget(simRef, ship) : null;
    // Nothing goes out of a wreck, an adrift hull, a ship gone weapons tight or a saturated sink.
    if (left > 0 && target && !fireReason(ship, target, true)) {
      for (const s of SALVOS) if (left >= s[1]) acts.push({ id: s[0], label: s[2], tip: salvoTip(ship, target, s[1]), active: false });
      acts.push({ id: 'launchAll', label: '全部发射（' + left + ')', tip: salvoTip(ship, target, left), active: false });
      // The old single button, kept so anything still asking for 'launch' empties the rails.
      acts.push({ id: 'launch', label: '发射拦截弹', tip: salvoTip(ship, target, left), alias: 'launchAll', hidden: true, active: false });
    }
    return acts;
  }
  function salvoTip(ship, target, n) {
    const e = salvoEstimate(simRef, ship, target, n);
    if (e.reason === '无跟踪') return n + ' 枚拦截弹打 ' + target.name + '。发射舱要求跟踪质量 ' + T.salvoTrackQ + '，而我们对她还只有接触。';
    if (!e.flightTime) return n + ' 枚拦截弹打 ' + target.name + '。她拉开的速度比拦截弹能追的还快，一枚都到不了。';
    return n + ' 枚拦截弹打 ' + target.name + '，飞行 ' + U.fmt.time(e.flightTime) + '。她现在' +
      (e.reach ? '在拦截弹射程内' : '在拦截弹射程外') + '。她的点防御大约能拦掉 ' + e.theirPdCanStop + ' 枚，所以能到 ' + e.through + ' 枚。';
  }

  const FIRE_IDS = { fire_full: 'full', fire_sustained: 'sustained', fire_hold: 'hold' };
  const AIM_IDS = { aim_hull: 'hull', aim_radiators: 'radiators', aim_drive: 'drive', aim_mounts: 'mounts' };
  function onAction(sim, ship, id) {
    if (!ship) return;
    const st = stateOf(ship);
    if (id === 'holdbeams') { // the old toggle, kept working
      setFireMode(ship, st.fireMode === 'hold' ? 'full' : 'hold');
      sim.addLog(ship.name + (st.fireMode === 'hold' ? '：光束待机。' : '：光束已放开。'), 'Gunnery', 'info');
      return;
    }
    if (FIRE_IDS[id]) {
      setFireMode(ship, FIRE_IDS[id]);
      const say = st.fireMode === 'full' ? '：光束全力。热沉会满。'
        : st.fireMode === 'sustained' ? '：光束持续，额定功率的 ' + Math.round(beamGain(ship) * 100) + ' %。'
          : '：光束待机。线圈炮和发射舱照常开火。';
      sim.addLog(ship.name + say, 'Gunnery', 'info');
      return;
    }
    if (AIM_IDS[id]) {
      setAimPoint(ship, AIM_IDS[id]);
      const target = engagementTarget(sim, ship);
      sim.addLog(ship.name + '：瞄准' + aimLabel(ship, target) + '。', 'Gunnery', 'info');
      return;
    }
    if (id === 'launch' || id === 'launchAll') { salvo(sim, ship, 'all'); return; }
    if (id === 'launch2') { salvo(sim, ship, 2); return; }
    if (id === 'launch4') { salvo(sim, ship, 4); }
  }

  function physicsNotes(ship, target) {
    if (!ship || !ship.mounts) return [];
    const cls = OD.Ships.CLASSES[ship.cls] || {};
    const R = target ? Math.max(1, U.dist(ship.pos, target.pos)) : ((cls.doctrine && cls.doctrine.range) || 250e3);
    const notes = [];
    const mount = bestBeam(ship);
    if (canShoot(ship)) notes.push(trackNote(ship, target || null, mount, R));
    const coil = bestCoilgun(ship);
    if (coil) notes.push(coilgunNote(ship, target, coil, R));
    if (mount) notes.push(beamNote(ship, target, mount, R));
    const ladder = mount ? ladderNote(ship, target, R) : null;
    if (ladder) notes.push(ladder);
    const launch = launchNote(ship, target);
    if (launch) notes.push(launch);
    return notes;
  }

  // The largest mirror still answering, for the notes and the ladder's explanation.
  function bestBeam(ship) {
    let mount = null, bi = 0;
    const n = countKind(ship, 'beam');
    const rack = ship.mounts || [];
    for (let mi = 0; mi < rack.length; mi++) {
      const m = rack[mi];
      if (m.kind !== 'beam') continue;
      if (mountLive(ship, bi++, n, mi) && (!mount || m.aperture > mount.aperture)) mount = m;
    }
    return mount;
  }

  // The track everything else rests on: how well we hold her, what that does to the pointing, and
  // what the spot at this range comes to because of it.
  function trackNote(ship, target, mount, R) {
    const q = trackQuality(simRef, ship, target);
    const f = 1 + T.trackJitter * (3 - q);
    const word = q < 1.8 ? '接触' : q < 2.7 ? '跟踪' : '解算';
    let body = (target ? target.name + '：' + word + '，q = ' + U.fmt.num(q, 3) : '无目标：按已有解算算，q = 3') + '\n' +
      '晃动 = 1 + ' + T.trackJitter + '·(3 − q) = 瞄准误差 ×' + U.fmt.num(f, 3);
    if (mount) {
      const diff = P.beamSpotDiameter(mount.wavelength, R, mount.aperture);
      const spot = diff + 2 * pointingJitter(ship, target) * R;
      const solid = diff + 2 * pointingJitter(ship) * R;
      body += '\n' + mount.name + ' 在 ' + U.fmt.dist(R) + '：光斑 ' + spotFmt(spot) + '，有解算时是 ' + spotFmt(solid);
    } else {
      body += '\n仅瞄准误差在 ' + U.fmt.dist(R) + ' 上就摊开到 ' + spotFmt(2 * pointingJitter(ship, target) * R);
    }
    // What the track costs the coilguns, which is a different currency from what it costs the beams.
    // A beam pays in spot area; a round pays in where it is sent, and the error in her velocity is
    // the error in that place, multiplied by every second the round is in the air.
    const coil = bestCoilgun(ship);
    if (coil) {
      const vErr = trackVelErr(simRef, ship, target);
      const flight = P.slugFlightTime(R, coil.muzzleVelocity);
      const window = T.slugHullLengths * Math.max(20, (target && target.length) || ship.length || 100);
      body += '\n提前量取决于她的速度：±' + U.fmt.speed(vErr) + ' 的误差，在 ' + U.fmt.time(flight) +
        ' 的飞行时间里会把弹丸送出 ' + U.fmt.dist(vErr * flight) + '，而只有落在 ' + U.fmt.dist(window) + ' 以内才算命中' +
        (vErr > 0 ? '。每一发各有各的误差。' : '。她被钉住了，每一发都打向同一个点。');
    }
    body += '\nq 低于 ' + T.slugSolutionQ + ' 时，光束和线圈炮没有解算，按住不打。低于 ' + T.salvoTrackQ + ' 时发射舱不发射。';
    return { title: '跟踪质量', body };
  }

  function beamNote(ship, target, mount, R) {
    const shot = beamShot(ship, mount, R, undefined, undefined, target);
    const diff = P.beamSpotDiameter(mount.wavelength, R, mount.aperture);
    const jit = 2 * pointingJitter(ship, target) * R;
    const facet = target ? facetSeen(ship, target) : null;
    const soak = target ? T.armourWatts * armourCm(target, facet) : 0;
    const through = Math.max(0, shot.onTarget - soak);
    const body =
      mount.name + '：' + U.fmt.power(mount.power) + '，光束利用效率 ' + Math.round(mount.efficiency * 100) + ' %，反射镜口径 ' + mount.aperture + ' 米，波长 ' + U.fmt.si(mount.wavelength, 'm') + '\n' +
      'spot = 2.44·λ·R/D + 瞄准 = ' + spotFmt(diff) + ' + ' + spotFmt(jit) + ' = ' + spotFmt(shot.spot) + '（' + U.fmt.num(shot.area, 3) + ' 平方米），R = ' + U.fmt.dist(R) + '\n' +
      'on target = ' + U.fmt.power(shot.emitted) + ' × min(1, ' + T.cell + ' m² / spot) = ' + U.fmt.power(shot.onTarget) +
      (target
        ? '\n' + target.name + ' 露出的是' + facet + '：' + armourCm(target, facet) + ' 厘米吸收 ' + U.fmt.power(soak) + ' → ' + (through > 0 ? U.fmt.power(through) + ' 打进舰体' : '一点都穿不过去')
        : '\n（无目标：按这型舰体的条令距离显示）');
    return { title: '此距离光束效果', body };
  }

  // The ladder. For every pair of beams and facet there is a range inside which the beams put
  // energy through and outside which nothing does, so picking a range is picking who can be hurt.
  const rangeWord = (m) => (m <= 0 ? 'never' : m >= T.beamReachCap ? 'beyond ' + U.fmt.dist(T.beamReachCap) : U.fmt.dist(m));
  const facetLine = (b) => 'nose ' + rangeWord(b.nose) + ' · flank ' + rangeWord(b.flank) + ' · tail ' + rangeWord(b.tail);
  // What the throttle costs the ladder. The pointing error carries T.jitterBurn, so a hull at full
  // throttle points three times as wide as a coasting one, the spot grows with it and every range
  // below falls with it: nose 650 km coasting against 347 km at full throttle on a corvette. It is
  // the largest swing on the screen and nothing on the physics screen said why.
  function throttleFacets(ship, target) {
    const mount = bestBeam(ship);
    if (!mount) return null;
    const armour = (target ? target.armour : (OD.Ships.CLASSES[ship.cls] || {}).armour) || null;
    if (!armour) return null;
    const gain = reachGain(ship) * aimShare(aimEffective(ship, target));
    const burn = 1 + T.jitterBurn * U.clamp(ship.throttle || 0, 0, 1);
    const base = pointingJitter(ship, target) / burn;   // the same hull and the same track, drive cold
    const at = (th) => {
      const jit = base * (1 + T.jitterBurn * U.clamp(th, 0, 1));
      const b = { nose: 0, flank: 0, tail: 0 };
      for (let i = 0; i < FACETS.length; i++) b[FACETS[i]] = beamBurnRange(ship, mount, T.armourWatts * (armour[FACETS[i]] || 0), gain, target, jit);
      return b;
    };
    return { cold: at(0), full: at(1) };
  }
  // One sentence for every row that prints a burn-through range. The drive is the reason the
  // number moves while nothing else on the screen has changed. A third to a half is the measured
  // span, not a hedge: the spot is diffraction plus pointing, so a hull held at a solution loses
  // about half its reach (nose 650 km to 347 km) and one held at a bare contact nearer two thirds.
const THROTTLE_TIP = '推进器会让反射镜抖。满推力时瞄准误差是冷车时的 ' + (1 + T.jitterBurn) +
  ' 倍，所以烧穿距离只有冷车时的三分之一到一半。开火前先把推力收回来。';
  function ladderNote(ship, target, R) {
    const r = reach(simRef, ship, target);
    if (!r) return null;
    const ours = target ? facetSeen(ship, target) : 'flank';
    let body =
      'burn-through = √(4·emitted·cell / π·k²·soak)，k = 2.44λ/D + 2·jitter。在这个距离内光束能打开那一面装甲，出了这个距离一点都穿不过去\n' +
      '我方对她的' + facetLine(r.beams);
    // The line above is at the throttle this hull is holding now, so only the other end of the
    // throttle is worth printing: two identical ladders one under the other teach nothing.
    // a hull with no drive (a station) has no throttle to cut, so she gets no throttle lines
    const th = ship.thrust > 0 ? throttleFacets(ship, target) : null;
    if (th) {
      if (ship.throttle > 0.01) body += '\n我方冷车时：' + facetLine(th.cold);
      if (ship.throttle < 0.99) body += '\n满推力时：' + facetLine(th.full);
      body += '\n推进器让反射镜抖，满推力时瞄准误差 ×' + (1 + T.jitterBurn) +
        '，上面每个距离都跟着缩。开火前先把推力收回来。';
    }
    if (target) {
      body += '\n她对我方的' + facetLine(r.their.beams) +
        '\n在 ' + U.fmt.dist(R) + ' 上，她把' + ours + '对着我们，我们把' + r.their.facet + '对着她' +
        '\n' + (r.beams[ours] >= R ? '我方光束能烧穿她的' + ours : '她的' + ours + '装甲撑得住') + '，' + (r.their.beams[r.their.facet] >= R ? '她的光束也能烧穿我方的' + r.their.facet : '我方' + r.their.facet + '装甲撑得住');
    } else body += '\n（无目标：按同型舰体显示）';
    return { title: '烧穿距离', body };
  }

  // What a bay can still reach, and what waits for it at the other end.
  function launchNote(ship, target) {
    const rec = bestBay(ship);
    if (!rec) return null;
    const sol = launchSolution(ship, target || null);
    if (!sol) return null;
    const left = bayCount(ship);
    let body =
      '拦截弹：自带 ' + U.fmt.dv(sol.dv) + ' 的速度增量（齐奥尔科夫斯基公式，干重 ' + rec.dryMass + ' 公斤，推进剂 ' + rec.propMass + ' 公斤，离轨总重 ' + (rec.dryMass + rec.propMass) + ' 公斤），离轨加速度 ' + U.fmt.num(rec.accel, 3) + ' 米/秒²，反推加速度 ' + U.fmt.num(sol.brakeAccel, 3) + ' 米/秒²，到那时它几乎已经烧干\n' +
      '它先积累 ' + U.fmt.speed(sol.closing) + ' 的接近速度，然后在最后 ' + U.fmt.dist(sol.dBrake) + ' 内反推 ' + U.fmt.time(sol.tBrake) + '，到达时速度 ' + U.fmt.speed(sol.terminal) + '\n' +
      '发射射程 = 在 ' + U.fmt.time(T.dartLife) + ' 续航内完成点火 + 滑行 + 反推 = ' + rangeWord(sol.reach) + '（舰上 ' + left + ' 枚）\n' +
      '到达时的能量是 ½·m·v²，这里的 m 是接触瞬间的质量，含剩余推进剂：' +
        U.fmt.energy(0.5 * rec.dryMass * sol.terminal * sol.terminal) + '（烧干到达时速度 ' + U.fmt.speed(sol.terminal) + '），' +
        U.fmt.energy(0.5 * terminalMass(rec, sol) * sol.terminal * sol.terminal) + '（还留着 ' + Math.round(terminalMass(rec, sol) - rec.dryMass) + ' 公斤推进剂），装甲另算\n' +
      '拦截弹如果在反推前就烧干了，就会带着剩下的相对速度撞上去。相对速度多四分之一，到达能量就多一半。';
    if (target) {
      const d = U.dist(ship.pos, target.pos);
      const e = salvoEstimate(simRef, ship, target, left);
      body += '\n' + target.name + ' 在 ' + U.fmt.dist(d) + '：' + (e.reach ? '在射程内' : '在射程外') +
        (e.flightTime ? '，飞行 ' + U.fmt.time(e.flightTime) : '') +
        '\n她的点防御在 ' + U.fmt.dist(T.pdRange) + ' 内每分钟大约拦掉 ' + U.fmt.num(pdRate(target) * 60, 2) + ' 枚，所以大概拦下 ' + e.theirPdCanStop + ' 枚，到 ' + e.through + ' 枚';
    }
    return { title: '拦截弹射程', body };
  }

  // The coilgun's whole case, and the whole case against it: the round is honest about where it is
  // going and takes a minute and a half to get there.
  function coilgunNote(ship, target, mount, R) {
    const flight = P.slugFlightTime(R, mount.muzzleVelocity);
    const hull = Math.max(20, (target && target.length) || ship.length || 100);
    const window = T.slugHullLengths * hull;
    // A jink is a two-second lateral burst at most of the drive's acceleration: a little sideways
    // motion during the burn, and then the drift it leaves behind for the rest of the flight.
    const jinkA = 0.7 * ((target && target.accel && target.accel()) || (ship.accel && ship.accel()) || 5);
    const burn = 2;
    const drift = P.lateralDisplacement(burn, jinkA) + jinkA * burn * Math.max(0, flight - burn);
    const facet = target ? facetSeen(ship, target) : null;
    // What it is worth where it lands, not where it left: the closing geometry is part of the round.
    const hit = slugArrival(ship, target, mount);
    const through = target ? kineticThrough(hit.energy, target, facet) : 0;
    // The fall both of them take while the round is in the air. It is the same for the round and
    // for her, which is why the gun can lead it — and why ignoring it missed a holding hull.
    const g = simRef && simRef.body ? simRef.gravity(ship.pos) : null;
    const gHere = g ? U.len(g) : 0;
    const fall = 0.5 * gHere * flight * flight;
    const body =
      mount.name + '：' + U.fmt.num(mount.slugMass, 3) + ' 公斤弹丸，初速 ' + U.fmt.speed(mount.muzzleVelocity) + '，动能 ' + U.fmt.energy(slugEnergy(mount)) + '，每 ' + mount.cycle + ' 秒一发（弹仓还剩 ' + magazine(ship) + ' 发）\n' +
      '飞行时间 = R / v = ' + U.fmt.dist(R) + ' / ' + U.fmt.speed(mount.muzzleVelocity) + ' = ' + U.fmt.time(flight) + '。炮是朝她那时会在的位置打的\n' +
      (target
        ? '炮口能量是在我们自己的参考系里算的。' + target.name + ' 也在动，所以命中能量是 ½·m·|v_slug − v_target|² = ' + U.fmt.energy(hit.energy) +
          '，而它离开导轨时是 ' + U.fmt.energy(slugEnergy(mount)) + '。弹丸到达时相对她的速度是 ' + U.fmt.speed(hit.speed) + '\n'
        : '炮口能量是在我们自己的参考系里算的。目标也在动，所以命中能量是 ½·m·|v_slug − v_target|²，对比它离开导轨时的能量\n') +
      (fall > 0 ? '弹丸飞行时弹和舰都在下坠：½·g·t² = ' + U.fmt.dist(fall) + '，此处 g = ' + U.fmt.num(gHere, 2) + ' 米/秒²，提前量就是按这个算的\n' : '') +
      '以 ' + U.fmt.num(jinkA, 3) + ' 米/秒² 规避 2 秒，到那时她已离开瞄准点 ' + U.fmt.dist(drift) + '。只有落在 ' + U.fmt.dist(window) + ' 以内才算命中' +
      (target
        ? '\n' + target.name + ' 露出的是' + facet + '：' + armourCm(target, facet) + ' 厘米吸收 ' + U.fmt.power(soak) + ' → ' + (through > 0 ? U.fmt.power(through) + ' 打进舰体' : '一点都穿不过去')
        : '\n（无目标：按这型舰体的条令距离显示）');
    return { title: '此距离弹丸效果', body };
  }

  // ------------------------------------------------------------------ kinetics
  // Everything that takes time to arrive. A beam is an argument about optics; a slug and an
  // interceptor are arguments about where the other ship will be, and the answers differ.
  //
  //  eng.slugs:        {x, y, vx, vy, energy, aim{x,y,vx,vy}, t, from, to}  unguided, beaten by a burn
  //                    aim is the ghost: the place the gun said she would be, falling as she falls
  //  eng.interceptors: {pos, vel, dv, accel, target, from, faction, hp}  small craft, PD shoots them
  //
  // A kinetic hit is stopped by the joule where a beam is stopped by the watt, so both go through
  // the facet the hull was showing and land whatever is left with landEnergy().
  function kineticThrough(joules, target, facet) {
    return Math.max(0, joules - T.armourJoules * armourCm(target, facet));
  }
  // The facet a projectile came in on: the bearing back from the target to where the round is now.
  function facetFrom(x, y, target) {
    return facetSeen({ pos: { x, y } }, target);
  }
  function gravityAt(sim, pos) {
    return sim.body ? sim.gravity(pos) : null;
  }

  // Free fall, and why the guns have to know about it. Everything unpowered in a field falls while
  // it flies — the round, and the hull it was aimed at, at their own rates. A lead worked out in
  // straight lines misses a hull that never touched its drive by the difference between the two
  // falls: half a g t² apiece, which over Io at a minute and a half is more than a kilometre
  // against a window a couple of hull lengths wide. So the lead is solved against the falls, and
  // the round carries a ghost — a free-fall copy of the track, started where the gun said she was
  // and flying the velocity the track gave her. The ghost is stepped with the same step the sim
  // gives a ship, so a ghost and a hull that is only falling stay together to the metre however
  // long the flight, and the arrival test stays what it always was: is she still where we said.
  function ghostStep(sim, gh, dt) {
    const g = gravityAt(sim, gh);
    if (g) { gh.vx += g.x * dt; gh.vy += g.y * dt; }
    gh.x += gh.vx * dt; gh.y += gh.vy * dt;
  }
  // Where a point in free fall ends up t seconds from now, into a record the caller owns. Coarser
  // than the sim's own step on purpose: every caller compares two of these against each other, so
  // what the coarse step gets wrong it gets wrong to both alike.
  function coastTo(sim, out, x, y, vx, vy, t) {
    out.x = x; out.y = y; out.vx = vx; out.vy = vy;
    if (!(t > 0)) return out;
    if (!sim.body) { out.x = x + vx * t; out.y = y + vy * t; return out; }
    const n = Math.max(1, Math.min(300, Math.ceil(t / T.leadStep)));
    const h = t / n;
    for (let i = 0; i < n; i++) ghostStep(sim, out, h);
    return out;
  }
  // Scratch for the predictions: the threat board asks for two of these per round in the sky every
  // substep, and nothing in here is allowed to make garbage.
  const FALL_A = { x: 0, y: 0, vx: 0, vy: 0 }, FALL_B = { x: 0, y: 0, vx: 0, vy: 0 };
  // How far a free-fall path bends away from the straight line over the same time, which is the
  // part of the lead a straight-line solution has no way to know about.
  function fallOff(sim, out, x, y, vx, vy, t) {
    coastTo(sim, out, x, y, vx, vy, t);
    out.x -= x + vx * t; out.y -= y + vy * t;
    return out;
  }

  // ------------------------------------------------------------------ coilguns
  // A coilgun throws a lump of iron at a place the target has not reached yet. Nothing steers it
  // afterwards. The gun is cheap, the round is cheap, and both are wasted the moment the target
  // touches its drive — which is why a corvette that jinks is so expensive to kill with one.
  const slugEnergy = (m) => 0.5 * m.slugMass * m.muzzleVelocity * m.muzzleVelocity;
  // What the round is worth where it lands, which is not what it was worth where it left. Muzzle
  // energy is booked in the shooter's frame and the target is not in it: two hulls closing add
  // their closing speed to the round, and two hulls opening take it away. A 5 kg slug that leaves
  // the rail at 4 km/s (40 MJ) and meets a hull coming the other way at 7.5 km/s is 141 MJ of iron.
  // So the hit is ½·m·|v_slug − v_target|² at contact, worked out here and nowhere else.
  const relEnergy = (mass, vx, vy, target) => {
    const dx = vx - (target && target.vel ? target.vel.x : 0);
    const dy = vy - (target && target.vel ? target.vel.y : 0);
    return 0.5 * mass * (dx * dx + dy * dy);
  };
  const slugArrivalEnergy = (s) => relEnergy(s.mass || 0, s.vx, s.vy, s.to);
  // The same number before the round is fired: the muzzle velocity laid along the firing solution,
  // plus our own velocity, against hers. It is what the coilgun note prints at this range.
  function slugArrival(ship, target, mount) {
    const mv = mount.muzzleVelocity;
    const out = { speed: mv, energy: 0.5 * mount.slugMass * mv * mv, flight: 0 };
    if (!target) return out;
    const rel = U.sub(target.pos, ship.pos);
    const relV = U.sub(estimatedVel(simRef, ship, target), ship.vel);
    const t = P.interceptTime(rel, relV, mv);
    const dir = t > 0 ? U.norm(U.add(rel, U.scale(relV, t))) : U.norm(rel);
    const vx = ship.vel.x + dir.x * mv, vy = ship.vel.y + dir.y * mv;
    out.flight = t > 0 ? t : 0;
    out.energy = relEnergy(mount.slugMass, vx, vy, target);
    out.speed = Math.sqrt((2 * out.energy) / Math.max(1e-9, mount.slugMass));
    return out;
  }

  function tickMounts(ship, dt) {
    for (const m of ship.mounts || []) if (m.kind === 'coilgun' && m.cooldown > 0) m.cooldown = Math.max(0, m.cooldown - dt);
  }

  function fireCoilguns(sim, ship, target, dt, eng) {
    const n = countKind(ship, 'coilgun');
    if (!n) return;
    // What the mounts cycle in. Short-handed at 0.7 a 6 s gun takes 8.6 s to load the next round.
    const fire = fireFactor(ship);
    // A round is thrown at where the track says she will be in a minute and a half. Short of a
    // solution there is no such place and the magazine is worth more than the shot: the mounts
    // hold, and the readout says 'no solution'.
    if (solutionReason(sim, ship, target)) return;
    let tvel = null; // her velocity as the track has it: the lead is only as good as that
    let vErr = 0;    // and how good that is: the spread each round's own lead is drawn from
    let ci = 0;
    for (let mi = 0; mi < ship.mounts.length; mi++) {
      const m = ship.mounts[mi];
      if (m.kind !== 'coilgun') continue;
      const live = mountLive(ship, ci++, n, mi);
      if (!live || m.magazine <= 0 || m.cooldown > 0) continue;
      if (!tvel) { tvel = estimatedVel(sim, ship, target); vErr = trackVelErr(sim, ship, target); }
      // The velocity this round is laid on. Below a solution the mounts are holding anyway, so
      // this is the difference between a hull that is pinned and one that is only just a solution:
      // the pinned one takes every round, and the other one is shot at ± the track's velocity
      // error, which is metres a second and becomes hundreds of metres over a minute of flight.
      let avel = tvel;
      if (vErr > 0) {
        const a = eng.rng() * U.TAU;
        avel = { x: tvel.x + Math.cos(a) * vErr, y: tvel.y + Math.sin(a) * vErr };
      }
      const rel = U.sub(target.pos, ship.pos);
      const relV = U.sub(avel, ship.vel);
      let t = P.interceptTime(rel, relV, m.muzzleVelocity);
      // No intercept means the target is opening faster than the round would close: hold the shell.
      if (!(t > 0) || t > T.slugMaxFlight) continue;
      // The solution is in the relative frame, so the lead is too: the round already carries the
      // ship's own velocity, and aiming in the world frame throws it |ship.vel|·t wide of the aim.
      let dir = U.norm(U.add(rel, U.scale(relV, t)));
      // Then the field. Take her fall over the flight off the round's own and put the difference
      // into the relative position the solution is worked out from, and solve again: what is left
      // after three passes is metres. In deep space every fall is zero and this changes nothing.
      for (let pass = 0; sim.body && pass < T.leadPasses; pass++) {
        const hers = fallOff(sim, FALL_A, target.pos.x, target.pos.y, avel.x, avel.y, t);
        const ours = fallOff(sim, FALL_B, ship.pos.x, ship.pos.y,
          ship.vel.x + dir.x * m.muzzleVelocity, ship.vel.y + dir.y * m.muzzleVelocity, t);
        const bent = { x: rel.x + hers.x - ours.x, y: rel.y + hers.y - ours.y };
        const tn = P.interceptTime(bent, relV, m.muzzleVelocity);
        if (!(tn > 0)) break; // the correction has no solution: keep the straight one and fire
        t = tn;
        dir = U.norm(U.add(bent, U.scale(relV, t)));
      }
      if (!(t > 0) || t > T.slugMaxFlight) continue;
      // The place the gun says she will be, as a thing that falls the way she does. It starts
      // where she is and flies the velocity the track gave her, so a fuzzy track still leads wide.
      const aim = { x: target.pos.x, y: target.pos.y, vx: avel.x, vy: avel.y };
      m.magazine--;
      m.cooldown = m.cycle / fire;
      // extraHeat is a rate the thermal step integrates, so a shot's joules go in divided by the step.
      ship.extraHeat = (ship.extraHeat || 0) + m.heatPerShot / Math.max(dt, 1e-3);
      eng.stats.slugsFired++;
      eng.slugs.push({
        id: 'k' + ++eng.seq,
        x: ship.pos.x + dir.x * ship.length, y: ship.pos.y + dir.y * ship.length,
        vx: ship.vel.x + dir.x * m.muzzleVelocity, vy: ship.vel.y + dir.y * m.muzzleVelocity,
        mass: m.slugMass, energy: slugEnergy(m), aim, t, from: ship, to: target, color: colorOf(ship),
        // Everything else moved earlier in this substep; this round has not been fired yet when
        // that happened. Skipping its first step is what keeps the aim point in step with the
        // hull it is a ghost of — one step of a low orbit is half a kilometre.
        fresh: true,
      });
    }
  }

  function updateSlugs(sim, dt, eng) {
    const arr = eng.slugs;
    for (let i = arr.length - 1; i >= 0; i--) {
      const s = arr[i];
      if (s.fresh) { s.fresh = false; continue; } // fired after everything else moved this substep
      const g = gravityAt(sim, s);
      if (g) { s.vx += g.x * dt; s.vy += g.y * dt; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      ghostStep(sim, s.aim, dt); // the aim point falls with her, on her step
      s.t -= dt;
      if (s.to.destroyed || s.to.captured) { arr.splice(i, 1); continue; } // nobody shells a prize
      if (s.t > 0) continue;
      arr.splice(i, 1);
      // The whole question: is she still where the gun said she would be? The aim point fell the
      // way she falls, so what is left between them is what her drive did, which is the point.
      const miss = U.dist(s.to.pos, s.aim);
      if (miss > T.slugHullLengths * Math.max(20, s.to.length || 100)) { eng.stats.slugMisses++; continue; }
      eng.stats.slugHits++;
      const facet = facetFrom(s.x, s.y, s.to);
      burst(sim, s.to.pos, 7, '#ffd9a0', 70);
      const past = kineticThrough(slugArrivalEnergy(s), s.to, facet);
      emit(sim, past > 0 ? 'through' : 'hit', s.to.pos, s.to.id, s.from ? s.from.id : null,
        s.to.name + ' 的' + facetZh(facet) + '挨了一发弹丸' + (past > 0 ? '。' : '。她的装甲撑住了。'));
      noteLanding(sim, s.from, s.to, 'slug', facet, past > 0);
      landEnergy(sim, s.from, s.to, past, facet, 'hull', 'slug');
    }
  }

  // ------------------------------------------------------------------ interceptors
  // Small craft with a drive of their own, so they answer a jink by turning with it. Nothing
  // reloads a launch rail in a fight: what leaves the bay is gone, and after the bay is spent the
  // hull has only its lasers. The panel empties every rail at once; the computer meters its bays
  // out a salvo at a time (below). What stops them is point defence, and point defence is a
  // matter of how many seconds of burning the ship gets before the dart is aboard.
  function launchSalvo(sim, ship, target, eng, max, auto) {
    let launched = 0, li = 0;
    const n = countKind(ship, 'launcher');
    if (!n) return 0;
    // No cap given is the panel's salvo: every rail that still has something on it.
    let budget = max === undefined ? Infinity : Math.max(0, Math.floor(max));
    const bearing = U.angleOf(U.sub(target.pos, ship.pos));
    const aimAt = aimEffective(ship, target); // the darts go for whatever gunnery has picked
    for (let mi = 0; mi < ship.mounts.length; mi++) {
      const m = ship.mounts[mi];
      if (m.kind !== 'launcher') continue;
      const live = mountLive(ship, li++, n, mi);
      if (!live || !(m.count > 0) || budget <= 0) continue;
      const take = Math.min(m.count, budget);
      const rec = m.interceptor;
      const dv = P.tsiolkovsky(rec.exhaustVelocity, rec.dryMass + rec.propMass, rec.dryMass);
      // The craft, not a charge: a mass that burns down to its dry mass, on a thrust that does not
      // change. Both travel with the dart, because both are in the arithmetic of what it arrives
      // with — the mass sets the hit, and the thrust over that mass is how hard it can still brake.
      const mass0 = rec.dryMass + rec.propMass;
      const thrust = dartThrust(rec);
      for (let k = 0; k < take; k++) {
        const dir = U.fromAngle(bearing + (eng.rng() - 0.5) * 0.3);
        eng.interceptors.push({
          id: 'd' + ++eng.seq,
          pos: U.add(ship.pos, U.scale(dir, ship.length)),
          vel: U.add(ship.vel, U.scale(dir, 40 + eng.rng() * 40)), // off the rails, then under their own drive
          dir, thrusting: true, dv, accel: rec.accel, hp: 0, age: 0, engagedT: -1e9,
          dv0: dv, ve: rec.exhaustVelocity, dry: rec.dryMass, mass0, mass: mass0, thrust, braking: false, terminal: false,
          target, from: ship, faction: ship.faction, color: colorOf(ship), aim: aimAt,
        });
        launched++;
      }
      m.count -= take;
      budget -= take;
    }
    if (launched) {
      eng.stats.interceptorsLaunched += launched;
      // The rails wait out the same gap whoever opened them. A salvo the bridge sent by hand is a
      // salvo in flight, and the doctrine must not double it inside the same window.
      const st = stateOf(ship);
      st.lastSalvo = sim.time;
      // One line per salvo, and on one of ours flown by the computer it says who did it — a bridge
      // that never touched the panel should not read its own bays emptying as its own order.
      // Throttled like the other Gunnery lines from a hull.
      const byComputer = !!auto && ship.faction === sim.playerFaction;
      if (!byComputer) {
        sim.addLog(ship.name + ' 向 ' + target.name + ' 发射了 ' + launched + ' 枚拦截弹。它们靠自己的推进器飞过去。', 'Gunnery', 'warn');
      } else if (sim.time - (st.lastAutoSaid == null ? -1e9 : st.lastAutoSaid) >= T.hitLogGap) {
        st.lastAutoSaid = sim.time;
        sim.addLog(ship.name + '：火控计算机向 ' + target.name + ' 发射了 ' + launched + ' 枚拦截弹。', 'Gunnery', 'warn');
      }
      emit(sim, 'launch', ship.pos, ship.id, ship.id, ship.name + '：' + launched + ' 枚拦截弹飞向 ' + target.name + '。');
      // The salvo is on the board the moment it leaves the rails, not when it is close enough to hurt.
      if (target.faction === sim.playerFaction) {
        const s = salvoEstimate(sim, ship, target, launched);
        emit(sim, 'incoming', target.pos, target.id, ship.id,
          launched + ' 枚拦截弹来袭，目标 ' + target.name + (s.flightTime ? '，' + U.fmt.time(s.flightTime) + ' 后到' : '。'));
      }
    }
    return launched;
  }

  // How far out the computer is willing to spend a bay: half again its hull's doctrine range,
  // and never past the cap — except for a lancer, whose whole argument is that it launches from
  // beyond everyone's reach and leaves before the reply arrives, so its own range stands.
  function aiLaunchRange(ship) {
    const doctrine = ((OD.Ships.CLASSES[ship.cls] || {}).doctrine) || {};
    const base = doctrine.range || 0;
    if (!base) return 0;
    return base > T.launchCap ? base : Math.min(base * T.launchDoctrine, T.launchCap);
  }
  const isStation = (s) => !!(((OD.Ships.CLASSES[s.cls] || {}).doctrine) || {}).stationary;
  const canShoot = (s) => (s.mounts || []).some((m) => m.kind === 'beam' || m.kind === 'coilgun' || m.kind === 'launcher');

  // A station is not going anywhere and cannot be made to. Interceptors are for the things that
  // can still choose the geometry, so anything under power and able to shoot comes first.
  function launchTarget(sim, ship, target, range) {
    const near = (s) => U.dist(s.pos, ship.pos) <= range;
    if (!isStation(target)) return near(target) ? target : null;
    let best = null, bd = Infinity;
    for (const s of sim.ships) {
      if (s === ship || s.destroyed || s.captured || s.disabled) continue;
      if (isStation(s) || !canShoot(s) || !hostileToFaction(sim, ship.faction, s)) continue;
      const d = U.dist(s.pos, ship.pos);
      if (d <= range && d < bd) { bd = d; best = s; }
    }
    return best || (near(target) ? target : null);
  }

  // The computer's launch doctrine. It does not open a scenario by throwing everything it owns at
  // the first contact on the plot: it waits until the target is inside its own launch range, sends
  // at most half of what is left, and then holds the rails for a couple of minutes before the next
  // salvo — keeping a quarter of the bay back for whatever comes after this fight, unless what it
  // is shooting at is big enough to be the thing the bay was loaded for.
  // A hull the player is commanding empties her bays on the panel's word alone; every other hull
  // on the doctrine — the computer's, and ours with ship.autoBays set — launches on this.
  function launchInterceptors(sim, ship, target, dt, eng) {
    if (!onDoctrine(ship)) return; // the commanded ship's bays wait for the panel
    if (!target) return;
    const left = bayCount(ship);
    if (!left) return;
    const st = stateOf(ship);
    if (sim.time - st.lastSalvo < T.salvoGap / fireFactor(ship)) return;
    const range = aiLaunchRange(ship);
    if (!range) return;
    const aim = launchTarget(sim, ship, target, range);
    if (!aim) return;
    if (trackQuality(sim, ship, aim) < T.salvoTrackQ) return; // the computer launches on a track, not on a rumour
    const worth = T.reserveWorth.indexOf(aim.cls) >= 0;
    const reserve = worth ? 0 : Math.floor(st.bayCap * T.bayReserve);
    const spendable = left - reserve;
    if (spendable <= 0) return;
    const salvo = Math.min(spendable, Math.max(1, Math.floor(left * T.salvoShare)));
    launchSalvo(sim, ship, aim, eng, salvo, true); // launchSalvo books the gap for both hands
  }

  // The sim decides who is hostile to whom; this only saves it a record per test, and point
  // defence runs that test for every mount against every dart in the sky.
  const SIDE = { faction: '' };
  function hostileToFaction(sim, faction, ship) {
    SIDE.faction = faction;
    return sim.isHostile(SIDE, ship);
  }
  function nearestHostileTo(sim, faction, pos) {
    let best = null, bd = Infinity;
    for (const s of sim.ships) {
      if (s.destroyed || s.captured || !hostileToFaction(sim, faction, s)) continue;
      const d = U.dist(s.pos, pos);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // What a dart weighs now: Tsiolkovsky run backwards over the delta-v it has already spent. It
  // never reads below the dry mass, because that is the lump that arrives.
  function dartMass(it) {
    if (!(it.mass0 > 0) || !(it.ve > 0)) return it.dry > 0 ? it.dry : 150;
    const spent = Math.max(0, (it.dv0 || 0) - Math.max(0, it.dv));
    return Math.max(it.dry || 0, it.mass0 * Math.exp(-spent / it.ve));
  }
  // The most closing it will let itself build, given what is in the tanks. Getting to c costs
  // (c − closing) and shedding it again costs (c − terminal), so it can afford c only while
  // 2c ≤ usable + closing + terminal. Holding to that every substep is what stops a dart ever
  // committing to an arrival it cannot slow down for.
  function dartCruise(it, closing) {
    const usable = Math.max(0, it.dv) * (1 - T.dartReserve);
    return Math.max(0, Math.min(T.dartClosing, (usable + closing + T.dartTerminal) / 2));
  }

  function updateInterceptors(sim, dt, eng) {
    const arr = eng.interceptors;
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      if (it.dead) { arr.splice(i, 1); continue; }
      it.age += dt;
      let target = it.target;
      if (!target || target.destroyed || target.captured) target = it.target = nearestHostileTo(sim, it.faction, it.pos);
      if (!target || it.age > T.dartLife) { arr.splice(i, 1); continue; }
      const rel = U.sub(target.pos, it.pos);
      const d = U.len(rel);
      const rhat = d > 1 ? U.scale(rel, 1 / d) : U.fromAngle(0);
      const vrel = U.sub(it.vel, target.vel);
      // The thrust is fixed and the mass is not: what it has burned off is what it can be lighter
      // by, straight out of Tsiolkovsky, so a nearly dry dart accelerates two and a half times as
      // hard as the rail figure says. That is what pays for the brake.
      it.mass = dartMass(it);
      it.accel = it.thrust > 0 ? it.thrust / Math.max(1, it.mass) : it.accel;
      // Lead pursuit: fly the relative velocity onto the line of sight at the closing speed it wants.
      // Killing the sideways component is what makes it follow a jink instead of being thrown by one.
      // The speed it wants is not one number. In the cruise it builds all the closing it can still
      // afford to shed again — never more, so it is never committed to a gigajoule arrival — and
      // once the target is inside its braking distance it flips and flies for T.dartTerminal, which
      // is the speed the hit is booked at. A dart with dry tanks wants the same thing and cannot
      // have it: it arrives at whatever it is carrying, and is booked for that instead.
      const closing = vrel.x * rhat.x + vrel.y * rhat.y;
      const cruise = dartCruise(it, closing);
      const vt = Math.min(T.dartTerminal, cruise);
      const b = burnAccel(it.thrust, it.mass, Math.max(0, closing - vt), it.ve) || it.accel;
      const brakeD = b > 0 ? Math.max(0, closing * closing - vt * vt) / (2 * b) : 0;
      // The terminal phase is a decision, not a reading: once it has committed to the brake it
      // stays committed. Letting it flip back out — which the cruise cap does the moment it is
      // slow enough to afford more closing again — had darts accelerating and braking in circles
      // a few kilometres short of a hull, burning the tanks dry on the spot.
      if (!it.terminal && closing > vt && d <= brakeD * T.dartBrakeLead) it.terminal = true;
      const wantClosing = it.terminal ? vt : Math.max(vt, cruise);
      const want = U.sub(U.scale(rhat, wantClosing), vrel);
      const wantMag = U.len(want);
      it.braking = !!it.terminal && closing > vt + 1;
      it.thrusting = it.dv > 0 && wantMag > 1;
      let ax = 0, ay = 0;
      if (it.thrusting) {
        it.dir = U.scale(want, 1 / wantMag);
        // Never more than the correction asks for. A drive that spends a full step of thrust on a
        // one-metre-a-second error does not fly a craft, it shakes one: the dart would arrive at
        // the velocity it wanted and then be thrown off it again, sideways, every substep.
        const spend = Math.min(it.accel * dt, it.dv, wantMag); // the burn stops when the tanks do
        it.dv -= spend;
        ax = (it.dir.x * spend) / dt; ay = (it.dir.y * spend) / dt;
      }
      const g = gravityAt(sim, it.pos);
      it.vel.x += (ax + (g ? g.x : 0)) * dt;
      it.vel.y += (ay + (g ? g.y : 0)) * dt;
      it.pos.x += it.vel.x * dt; it.pos.y += it.vel.y * dt;
      // Arrival. A dart closing at kilometres a second crosses its own hull length inside one
      // substep, so anything that got this close this step is aboard.
      const reach = Math.max(2 * (target.length || 100), U.len(vrel) * dt * 1.05);
      if (U.dist(target.pos, it.pos) > reach) continue;
      arr.splice(i, 1);
      eng.stats.interceptorHits++;
      const facet = facetFrom(it.pos.x, it.pos.y, target);
      burst(sim, target.pos, 12, '#ffd2a0', 80);
      // What it arrives with, and nothing else: its mass at contact against the speed it met her at.
      const past = kineticThrough(relEnergy(dartMass(it), it.vel.x, it.vel.y, target), target, facet);
      emit(sim, past > 0 ? 'through' : 'hit', target.pos, target.id, it.from ? it.from.id : null,
        target.name + ' 的' + facetZh(facet) + '挨了一枚拦截弹' + (past > 0 ? '。' : '。她的装甲撑住了。'));
      noteLanding(sim, it.from, target, 'interceptor', facet, past > 0);
      landEnergy(sim, it.from, target, past, facet, it.aim || 'hull', 'interceptor');
    }
  }

  // ------------------------------------------------------------------ point defence
  // The same optics as a main beam at a thousandth of the range, against something with no armour
  // worth the name. Every hull shoots its own: point defence is not gunnery asking permission, it
  // is the ship refusing to be hit. Only a wrecked mount, a saturated sink or a dead hull stops it.
  function pdOnTarget(ship, mount, range) {
    const R = Math.max(1, range);
    const spot = P.beamSpotDiameter(mount.wavelength, R, mount.aperture) + 2 * pointingJitter(ship) * R;
    const area = Math.PI * (spot / 2) * (spot / 2);
    return mount.power * mount.efficiency * Math.min(1, T.dartCell / Math.max(area, 1e-6));
  }

  function updatePointDefence(sim, dt, eng) {
    eng.pd.length = 0;
    const darts = eng.interceptors;
    for (const ship of sim.ships) stateOf(ship).pdEngaging = 0;
    if (!darts.length) return;
    for (const ship of sim.ships) {
      if (ship.destroyed || ship.disabled || ship.weaponsInhibited) continue;
      const n = countKind(ship, 'pd');
      if (!n) continue;
      const st = stateOf(ship);
      const gain = powerOf(ship);
      let pi = 0;
      for (let mi = 0; mi < ship.mounts.length; mi++) {
        const m = ship.mounts[mi];
        if (m.kind !== 'pd') continue;
        if (!mountLive(ship, pi++, n, mi)) continue;
        let best = null, bd = T.pdRange;
        for (const it of darts) {
          if (it.dead || !hostileToFaction(sim, it.faction, ship)) continue;
          const d = U.dist(it.pos, ship.pos);
          if (d < bd) { bd = d; best = it; }
        }
        if (!best) continue;
        best.hp += pdOnTarget(ship, m, bd) * gain * dt;
        best.engagedT = sim.time;
        st.pdEngaging++;
        ship.extraHeat = (ship.extraHeat || 0) + m.power * (1 - m.efficiency) * gain;
        // The line starts at the mount, not at the middle of the hull.
        const dx = best.pos.x - ship.pos.x, dy = best.pos.y - ship.pos.y, dd = Math.hypot(dx, dy) || 1;
        const off = (ship.length || 60) * 0.45;
        eng.pd.push({ x1: ship.pos.x + (dx / dd) * off, y1: ship.pos.y + (dy / dd) * off, x2: best.pos.x, y2: best.pos.y, color: colorOf(ship) });
        if (best.hp >= T.dartKill) {
          best.dead = true;
          eng.stats.pdKills++;
          st.pdKills++;
          burst(sim, best.pos, 8, '#ffe6b0', 55);
          eng.flashes.push({ x: best.pos.x, y: best.pos.y, life: T.flashLife, maxLife: T.flashLife, color: colorOf(ship) });
          emit(sim, 'pdkill', best.pos, ship.id, best.from ? best.from.id : null, ship.name + '：点防御拦掉了一枚拦截弹。');
          notePdKill(ship);
        }
      }
    }
    for (let i = darts.length - 1; i >= 0; i--) if (darts[i].dead) darts.splice(i, 1);
  }

  // ------------------------------------------------------------------ render: kinetics
  function onScreen(p, cam, pad) {
    return p.x > -pad && p.y > -pad && p.x < cam.w + pad && p.y < cam.h + pad;
  }

  // A fight has two or three factions in it and can have three hundred things in the sky. Grouping
  // by colour and laying every streak of one colour into a single path turns a few hundred draw
  // calls into a dozen, which is the difference between a broadside and a stutter. The arrays are
  // kept between frames and emptied, not rebuilt, so nothing here makes garbage either.
  const batches = new Map();
  function openBatches() {
    for (const a of batches.values()) a.length = 0;
  }
  function batchFor(color) {
    let a = batches.get(color);
    if (!a) { a = []; batches.set(color, a); }
    return a;
  }
  // arc() would draw a line in from wherever the path was: start each disc on its own rim.
  function disc(ctx, x, y, r) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, U.TAU);
  }

  // A tracer is the eye's memory of the round, not a thing that exists: it is held to a few pixels
  // so a slug reads as a slug at any zoom, brightest at the head and gone a moment behind it. Far
  // enough out that the streak would be shorter than the spark at its head, it becomes the spark
  // and stays one — a magazine's worth of rounds quietly vanishing is worse than a little licence.
  const SLUG_PASS = [[2.6, 1, 0.09, 0], [1.3, 0.62, 0.3, 0], [0.9, 0.26, 0.6, 0.55]];
  function renderSlugs(ctx, cam, eng) {
    if (!eng.slugs || !eng.slugs.length) return;
    const z = cam.zoom > 0 ? cam.zoom : 0;
    openBatches();
    let any = false;
    for (const s of eng.slugs) {
      const p = cam.toScreen(s);
      if (!onScreen(p, cam, 24)) continue;
      const v = Math.hypot(s.vx, s.vy) || 1;
      // screen y runs the other way from world y
      // Never shorter than a hairline: at a fit's zoom a slug is still a slug with a trail.
      batchFor(s.color || '#ffd9a0').push(p.x, p.y, s.vx / v, -s.vy / v, U.clamp(v * z * 2.2, 3.5, 15));
      any = true;
    }
    if (!any) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const entry of batches) {
      const col = entry[0], a = entry[1];
      if (!a.length) continue;
      for (let k = 0; k < SLUG_PASS.length; k++) {
        const ps = SLUG_PASS[k];
        ctx.lineWidth = ps[0];
        ctx.strokeStyle = ps[3] ? hot(col, ps[3], ps[2]) : rgba(col, ps[2]);
        ctx.beginPath();
        for (let i = 0; i < a.length; i += 5) {
          const L = a[i + 4];
          if (!(L > 0)) continue;
          ctx.moveTo(a[i] - a[i + 2] * L * ps[1], a[i + 1] - a[i + 3] * L * ps[1]);
          ctx.lineTo(a[i], a[i + 1]);
        }
        ctx.stroke();
      }
      ctx.fillStyle = rgba(col, 0.36);
      ctx.beginPath();
      for (let i = 0; i < a.length; i += 5) disc(ctx, a[i], a[i + 1], 2.4);
      ctx.fill();
      ctx.fillStyle = hot(col, 0.85, 0.95);
      ctx.beginPath();
      for (let i = 0; i < a.length; i += 5) disc(ctx, a[i], a[i + 1], 1);
      ctx.fill();
    }
    ctx.restore();
  }

  // A dart's own history, kept on the craft: eight points is enough for the eye to see it turn
  // with a jink, and it is thrown away with the craft, so nothing has to clean up after it.
  const DART_TRAIL = 8;
  function trackDart(it, cam) {
    const tr = it.trail || (it.trail = []);
    const last = tr.length ? tr[tr.length - 1] : null;
    if (!last) { tr.push({ x: it.pos.x, y: it.pos.y }); return; }
    if (Math.hypot(it.pos.x - last.x, it.pos.y - last.y) * (cam.zoom > 0 ? cam.zoom : 0) < 4) return;
    tr.push({ x: it.pos.x, y: it.pos.y });
    if (tr.length > DART_TRAIL) tr.shift();
  }
  // Every trail of one colour in one path. `keep` is how many points back to draw, so the same
  // history can be laid down twice — once faint for the whole of it, once brighter for the last
  // stretch — and read as a fade without a gradient per craft.
  function dartTrails(ctx, cam, eng, col, keep, alpha) {
    ctx.strokeStyle = rgba(col, alpha);
    ctx.beginPath();
    for (const it of eng.interceptors) {
      const tr = it.trail;
      if (!tr || tr.length < 2 || (it.color || '#ffd2a0') !== col) continue;
      let prev = cam.toScreen(tr[Math.max(0, tr.length - keep)]);
      let open = false;
      for (let i = Math.max(0, tr.length - keep) + 1; i <= tr.length; i++) {
        const cur = cam.toScreen(i < tr.length ? tr[i] : it.pos);
        // a step the sim took at high warp is a jump, not a trail: do not draw the whole map
        if (Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) < 300) {
          if (!open) { ctx.moveTo(prev.x, prev.y); open = true; }
          ctx.lineTo(cur.x, cur.y);
        } else open = false;
        prev = cur;
      }
    }
    ctx.stroke();
  }

  const DART_GLOW = [[5.6, 0.05], [3.8, 0.06], [2.2, 0.07]];
  function renderInterceptors(ctx, cam, eng, frame, calm) {
    if (eng.pd && eng.pd.length) {
      // Point defence is a shutter, not a searchlight: a few milliseconds per engagement. Held
      // steady and dimmed when the system has asked for less motion.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < eng.pd.length; i++) {
        if (!calm && (frame + i) % 3) continue;
        const e = eng.pd[i];
        const a = cam.toScreen({ x: e.x1, y: e.y1 }), b = cam.toScreen({ x: e.x2, y: e.y2 });
        if (!onScreen(b, cam, 30) && !onScreen(a, cam, 30)) continue;
        const lvl = calm ? 0.4 : 1;
        ctx.strokeStyle = rgba(e.color, 0.09 * lvl);
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = hot(e.color, 0.55, 0.7 * lvl);
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        bloom(ctx, b.x, b.y, 5, e.color, 0.5 * lvl);
        ctx.fillStyle = hot(e.color, 0.9, 0.6 * lvl);
        ctx.beginPath(); ctx.arc(b.x, b.y, 1, 0, U.TAU); ctx.fill();
      }
      ctx.restore();
    }
    if (!eng.interceptors || !eng.interceptors.length) return;
    openBatches();
    let any = false;
    for (const it of eng.interceptors) {
      const p = cam.toScreen(it.pos);
      // the history is worth keeping just off-screen, so a dart does not arrive trailless
      if (onScreen(p, cam, 120)) trackDart(it, cam);
      if (!onScreen(p, cam, 20)) continue;
      // Nose-on to the burn if it is burning, to its own velocity if it is coasting.
      let dx = 1, dy = 0;
      const d = it.thrusting && it.dir ? it.dir : it.vel;
      const m = d ? Math.hypot(d.x, d.y) : 0;
      if (m > 1e-9) { dx = d.x / m; dy = -d.y / m; }
      const plume = it.thrusting ? (calm ? 8 : 7 + 2.2 * Math.sin(frame * 0.8 + it.age)) : 0;
      batchFor(it.color || '#ffd2a0').push(p.x, p.y, dx, dy, plume);
      any = true;
    }
    if (!any) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.9;
    for (const entry of batches) {
      if (!entry[1].length) continue;
      dartTrails(ctx, cam, eng, entry[0], DART_TRAIL, 0.06);
      dartTrails(ctx, cam, eng, entry[0], 3, 0.12);
    }
    // The plumes are the same hot white whoever launched them, so they all go down together.
    for (let k = 0; k < 2; k++) {
      ctx.lineWidth = k ? 1.1 : 3.4;
      ctx.strokeStyle = k ? 'rgba(255,238,210,0.75)' : 'rgba(255,205,150,0.2)';
      ctx.beginPath();
      for (const entry of batches) {
        const a = entry[1];
        for (let i = 0; i < a.length; i += 5) {
          const pl = a[i + 4] * (k ? 0.5 : 1);
          if (!pl) continue;
          ctx.moveTo(a[i] - a[i + 2] * pl, a[i + 1] - a[i + 3] * pl);
          ctx.lineTo(a[i] - a[i + 2] * 2, a[i + 1] - a[i + 3] * 2);
        }
      }
      ctx.stroke();
    }
    for (const entry of batches) {
      const col = entry[0], a = entry[1];
      if (!a.length) continue;
      for (let k = 0; k < DART_GLOW.length; k++) {
        ctx.fillStyle = rgba(col, DART_GLOW[k][1]);
        ctx.beginPath();
        for (let i = 0; i < a.length; i += 5) disc(ctx, a[i], a[i + 1], DART_GLOW[k][0]);
        ctx.fill();
      }
      // A few pixels of dart: a glyph, not a hull. Nothing this small survives being drawn to
      // scale, and a craft you cannot tell from a spark is a craft the player never learns to fear.
      ctx.fillStyle = hot(col, 0.2, 0.95);
      ctx.beginPath();
      for (let i = 0; i < a.length; i += 5) {
        const x = a[i], y = a[i + 1], ux = a[i + 2], uy = a[i + 3];
        ctx.moveTo(x + ux * 4.4, y + uy * 4.4);
        ctx.lineTo(x - ux * 2.6 - uy * 2, y - uy * 2.6 + ux * 2);
        ctx.lineTo(x - ux * 1.2, y - uy * 1.2);
        ctx.lineTo(x - ux * 2.6 + uy * 2, y - uy * 2.6 - ux * 2);
        ctx.closePath();
      }
      ctx.fill();
      // and a core that never falls under three pixels, whatever the fit did to the zoom
      ctx.fillStyle = hot(col, 0.55, 0.9);
      ctx.beginPath();
      for (let i = 0; i < a.length; i += 5) disc(ctx, a[i], a[i + 1], 1.6);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    for (const entry of batches) {
      const a = entry[1];
      for (let i = 0; i < a.length; i += 5) disc(ctx, a[i] + a[i + 2] * 2.2, a[i + 1] + a[i + 3] * 2.2, 0.9);
    }
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------ magazine bookkeeping
  const magazine = (ship) => {
    let n = 0;
    for (const m of ship.mounts || []) if (m.kind === 'coilgun') n += Math.max(0, m.magazine || 0);
    return n;
  };
  const bayCount = (ship) => {
    let n = 0;
    for (const m of ship.mounts || []) if (m.kind === 'launcher') n += Math.max(0, m.count || 0);
    return n;
  };
  const inbound = (sim, ship) => {
    const eng = sim && sim.eng;
    if (!eng) return 0;
    let n = 0;
    for (const it of eng.interceptors) if (it.target === ship) n++;
    return n;
  };
  // The best coilgun still answering, for the physics note.
  function bestCoilgun(ship) {
    let mount = null, ci = 0;
    const n = countKind(ship, 'coilgun');
    const rack = ship.mounts || [];
    for (let mi = 0; mi < rack.length; mi++) {
      const m = rack[mi];
      if (m.kind !== 'coilgun') continue;
      if (mountLive(ship, ci++, n, mi) && (!mount || slugEnergy(m) > slugEnergy(mount))) mount = m;
    }
    return mount;
  }

  // ------------------------------------------------------------------ the threat board
  // Everything that can hurt a hull, with the seconds left before it arrives. The renderer asks
  // once a frame and the panel asks again, so the whole board is worked out at most once per
  // substep and handed back as the same arrays: once it is warm nothing here allocates.
  const FACETS = ['nose', 'flank', 'tail'];

  function slot(c, i) {
    let r = c.pool[i];
    if (!r) r = c.pool[i] = { kind: '', id: '', x: 0, y: 0, vx: 0, vy: 0, accel: 0, targetId: null, fromId: null, faction: '', color: '', eta: null, willHit: false, engaged: false, hp: 1 };
    return r;
  }
  // How long something closing at v0 takes to cover d: the burn first, at its own acceleration and
  // only as far as the propellant aboard carries it, then the coast at the speed it settled on. The
  // board's countdown and the salvo tip both come through here, so the two readouts of one salvo agree.
  function closeTime(d, v0, accel, dvLeft, cap) {
    if (!(d > 0)) return 0;
    const a = accel > 0 ? accel : 0;
    const want = Math.max(v0, Math.min(cap, v0 + Math.max(0, dvLeft)));
    const tBurn = a > 0 ? (want - v0) / a : 0;
    const dBurn = v0 * tBurn + 0.5 * a * tBurn * tBurn;
    if (d > dBurn) return want > 1 ? tBurn + (d - dBurn) / want : null;
    // she is aboard before the burn is done: the positive root of v0·t + ½a·t² = d
    if (a > 0) return (Math.sqrt(Math.max(0, v0 * v0 + 2 * a * d)) - v0) / a;
    return v0 > 1 ? d / v0 : null;
  }
  // When a dart arrives: the burn up to the cruise it can afford, the coast, and then the brake it
  // has to fly before contact — which covers ground of its own and takes time of its own, so a
  // countdown that left it out would promise her sooner than she comes. A spent dart has nothing
  // left to burn or to brake with, and the same solution reads its coast honestly.
  function dartEta(it, target) {
    if (!target) return null;
    const rx = target.pos.x - it.pos.x, ry = target.pos.y - it.pos.y;
    const d = Math.hypot(rx, ry);
    if (d < 1) return 0;
    const closing = ((it.vel.x - target.vel.x) * rx + (it.vel.y - target.vel.y) * ry) / d;
    const cruise = dartCruise(it, closing);
    const vt = Math.min(T.dartTerminal, cruise);
    // It has already committed to the brake: shed what it is carrying, then coast the rest in.
    if (it.terminal) {
      if (closing <= vt + 1) return closing > 1 ? d / closing : null;
      const bb = burnAccel(it.thrust, it.mass, closing - vt, it.ve) || it.accel;
      if (!(bb > 0)) return d / closing;
      const shed = Math.max(0, closing * closing - vt * vt) / (2 * bb);
      if (d <= shed) return (closing - Math.sqrt(Math.max(vt * vt, closing * closing - 2 * bb * d))) / bb;
      return (closing - vt) / bb + (d - shed) / Math.max(1, vt);
    }
    // Still in the cruise: the burn it has left to do, the coast, and then the brake — which is
    // flown on a much lighter craft than the one on the rail, so it is not the rail figure.
    const atCruise = it.ve > 0 ? Math.max(it.dry || 1, (it.mass || 1) * Math.exp(-Math.max(0, cruise - closing) / it.ve)) : it.mass || 1;
    const b = burnAccel(it.thrust, atCruise, Math.max(0, cruise - vt), it.ve) || it.accel;
    const dBrake = b > 0 ? Math.max(0, cruise * cruise - vt * vt) / (2 * b) : 0;
    const t = closeTime(Math.max(0, d - dBrake), closing, it.accel, it.dv, cruise);
    return t === null ? null : t + (b > 0 ? Math.max(0, cruise - vt) / b : 0);
  }
  // Whether the round still meets the hull: where she will be when it arrives against where the
  // gun said she would be. Both are carried forward in free fall the same way, so a hull that is
  // only falling stays on the aim and any burn between now and then moves the answer.
  function slugWillHit(sim, s) {
    const to = s.to;
    if (!to || to.destroyed || to.captured) return false;
    const hull = coastTo(sim, FALL_A, to.pos.x, to.pos.y, to.vel.x, to.vel.y, s.t);
    const said = coastTo(sim, FALL_B, s.aim.x, s.aim.y, s.aim.vx, s.aim.vy, s.t);
    return Math.hypot(hull.x - said.x, hull.y - said.y) <= T.slugHullLengths * Math.max(20, to.length || 100);
  }

  function threatCache(sim) {
    const eng = engOf(sim);
    const c = eng.threats || (eng.threats = { time: -1, stamp: -1, list: [], pool: [], byShip: new Map() });
    // eng.seq counts everything ever put in the sky, so a salvo fired between substeps — which is
    // every salvo fired from a paused bridge — is on the board at once, not at the next tick.
    if (c.time === sim.time && c.stamp === eng.seq) return c;
    c.time = sim.time; c.stamp = eng.seq;
    const list = c.list;
    list.length = 0;
    for (const it of eng.interceptors) {
      const r = slot(c, list.length), tgt = it.target;
      r.kind = 'interceptor'; r.id = it.id; r.x = it.pos.x; r.y = it.pos.y; r.vx = it.vel.x; r.vy = it.vel.y;
      r.accel = it.accel || 0;   // what it is pulling now, which is what it can still brake at
      r.targetId = tgt ? tgt.id : null; r.fromId = it.from ? it.from.id : null;
      r.faction = it.faction; r.color = it.color;
      r.eta = dartEta(it, tgt);
      r.willHit = r.eta !== null;
      r.engaged = it.engagedT >= sim.time - 1e-9;
      r.hp = U.clamp(1 - it.hp / T.dartKill, 0, 1);
      list.push(r);
    }
    for (const s of eng.slugs) {
      const r = slot(c, list.length);
      r.kind = 'slug'; r.id = s.id; r.x = s.x; r.y = s.y; r.vx = s.vx; r.vy = s.vy; r.accel = 0;
      r.targetId = s.to ? s.to.id : null; r.fromId = s.from ? s.from.id : null;
      r.faction = s.from ? s.from.faction : ''; r.color = s.color;
      r.eta = Math.max(0, s.t);
      r.willHit = slugWillHit(sim, s);
      r.engaged = false; r.hp = 1;
      list.push(r);
    }
    return c;
  }
  function threats(sim, ship) {
    const s = sim || simRef;
    if (!s || !s.eng) return EMPTY;
    const c = threatCache(s);
    if (!ship) return c.list;
    let f = c.byShip.get(ship.id);
    if (!f) { f = { time: -1, stamp: -1, arr: [] }; c.byShip.set(ship.id, f); }
    if (f.time !== c.time || f.stamp !== c.stamp) {
      f.time = c.time; f.stamp = c.stamp;
      f.arr.length = 0;
      for (const r of c.list) if (r.targetId === ship.id) f.arr.push(r);
    }
    return f.arr;
  }
  const EMPTY = [];

  // ------------------------------------------------------------------ reach
  // The burn-through range, in closed form. On target = emitted × min(1, cell / spot area), and
  // the spot grows straight with range: spot = (2.44λ/D + 2·jitter)·R. So past the range where the
  // spot fills the cross-section, energy on target falls as 1/R², and the range where it meets
  // what the facet soaks is R = √(4·emitted·cell / (π·k²·soak)).
  // `jitter` overrides the pointing error, so the physics note can ask what this same mount does
  // with the drive cold and at full throttle without touching the ship. Left out, it is the
  // pointing error the hull has right now.
  function beamBurnRange(ship, mount, soakW, gain, target, jitter) {
    const emitted = mount.power * mount.efficiency * gain;
    if (!(emitted > 0)) return 0;
    if (!(soakW > 0)) return T.beamReachCap; // unarmoured on that facet: as far as the optics carry
    if (emitted <= soakW) return 0;          // the plating drinks the whole mount at any range
    const k = (2.44 * mount.wavelength) / mount.aperture + 2 * (jitter === undefined ? pointingJitter(ship, target) : jitter);
    if (!(k > 0)) return T.beamReachCap;
    return Math.min(T.beamReachCap, Math.sqrt((4 * emitted * T.cell) / (Math.PI * k * k * soakW)));
  }
  function pdLive(ship) {
    // The same word gunnery gives the rate: a wreck, an adrift hull or an inhibited sink is not
    // engaging anything, whatever its mounts read.
    if (!ship || ship.destroyed || ship.disabled || ship.weaponsInhibited) return 0;
    const n = countKind(ship, 'pd');
    if (!n) return 0;
    let live = 0, i = 0;
    for (let mi = 0; mi < ship.mounts.length; mi++) if (ship.mounts[mi].kind === 'pd' && mountLive(ship, i++, n, mi)) live++;
    return live;
  }
  // The interceptor record off the first rail that still has something on it.
  function bestBay(ship) {
    const n = countKind(ship, 'launcher');
    if (!n) return null;
    let i = 0;
    for (let mi = 0; mi < ship.mounts.length; mi++) {
      const m = ship.mounts[mi];
      if (m.kind !== 'launcher') continue;
      const live = mountLive(ship, i++, n, mi);
      if (live && m.count > 0 && m.interceptor) return m.interceptor;
    }
    return null;
  }
  // A dart's thrust does not change; its mass does. The rated acceleration is the one it leaves the
  // rail with, on a full tank, and by the time the tank is empty the same thrust is moving 150 kg
  // instead of 400. That is the whole reason the terminal brake is affordable: it is flown nearly
  // dry, at two and a half times the acceleration the launch figure quotes.
  const dartThrust = (rec) => rec.accel * (rec.dryMass + rec.propMass);
  // The acceleration a burn of this size is actually flown at. The mass falls through the burn, so
  // neither end is the answer and the mean of the two is: near enough for a countdown, and much
  // better than quoting the rail figure for a brake flown on a nearly empty tank.
  function burnAccel(thrust, mass, dvNeed, ve) {
    if (!(thrust > 0) || !(mass > 0)) return 0;
    const end = ve > 0 ? mass * Math.exp(-Math.max(0, dvNeed) / ve) : mass;
    return thrust / Math.max(1, 0.5 * (mass + end));
  }
  const dartBrakeAccel = (rec, from, to) => {
    const ve = rec.exhaustVelocity, m0 = rec.dryMass + rec.propMass;
    const atCruise = ve > 0 ? Math.max(rec.dryMass, m0 * Math.exp(-Math.max(0, from) / ve)) : m0;
    return burnAccel(dartThrust(rec), atCruise, Math.max(0, from - to), ve);
  };

  // What a dart weighs when it arrives as its guidance intends: the dry lump plus the delta-v it
  // keeps back for the last few kilometres, which is the propellant still in the tanks at contact.
  // The sim books the hit off dartMass() at the moment it lands, and that is never the dry figure.
  function terminalMass(rec, sol) {
    const ve = rec.exhaustVelocity;
    if (!(ve > 0) || !(sol && sol.dv > 0)) return rec.dryMass;
    return rec.dryMass * Math.exp((T.dartReserve * sol.dv) / ve);
  }

  // How far a dart launched now could reach. It has to kill whatever sideways relative velocity we
  // are carrying before anything else, then build a cruise — and then shed that cruise again, because
  // a 150 kg lump arriving at kilometres a second is gigajoules and the interceptor is meant to be a
  // hit, not a planet-cracker. So the delta-v goes: the lateral kill, the burn up to the cruise, the
  // brake back down to T.dartTerminal, and a margin kept for the last few kilometres against a
  // jinking hull. Everything after the lateral kill costs 2·cruise − c0 − terminal, which is what
  // caps the cruise:  cruise ≤ (budget + c0 + terminal) / 2.
  function launchSolution(ship, target) {
    const rec = bestBay(ship);
    if (!rec) return null;
    const dv = P.tsiolkovsky(rec.exhaustVelocity, rec.dryMass + rec.propMass, rec.dryMass);
    if (!(dv > 0)) return null;
    let c0 = 0, lat = 0;
    if (target) {
      const rx = target.pos.x - ship.pos.x, ry = target.pos.y - ship.pos.y;
      const d = Math.hypot(rx, ry) || 1;
      const ux = rx / d, uy = ry / d;
      const vx = ship.vel.x - target.vel.x, vy = ship.vel.y - target.vel.y;
      c0 = vx * ux + vy * uy;
      lat = Math.hypot(vx - ux * c0, vy - uy * c0);
    }
    const a = rec.accel > 0 ? rec.accel : 0;
    const budget = dv * (1 - T.dartReserve) - lat;
    const zero = { dv, closing: 0, terminal: 0, tBurn: 0, tBrake: 0, dBrake: 0, c0, accel: a, brakeAccel: 0, reach: 0 };
    if (!(budget > 0)) return zero;
    // Slower than the speed it means to arrive at needs no brake at all.
    let closing = Math.min(T.dartClosing, c0 + budget);
    if (closing > T.dartTerminal) closing = Math.min(T.dartClosing, (budget + c0 + T.dartTerminal) / 2);
    if (!(closing > 0)) return zero;
    const terminal = Math.min(T.dartTerminal, closing);
    const b = dartBrakeAccel(rec, closing, terminal);
    const from = Math.max(0, c0);
    const tBurn = a > 0 ? Math.max(0, closing - from) / a : 0;
    const dBurn = a > 0 ? Math.max(0, closing * closing - from * from) / (2 * a) : 0;
    const tBrake = b > 0 ? Math.max(0, closing - terminal) / b : 0;
    const dBrake = b > 0 ? Math.max(0, closing * closing - terminal * terminal) / (2 * b) : 0;
    // The reach is the ground it covers inside its endurance, and the burn and the brake cover
    // ground too: closing × the life left over, with those two legs added back on.
    const tCoast = Math.max(0, T.dartLife - tBurn - tBrake);
    const reach = Math.max(0, dBurn + closing * tCoast + dBrake);
    return { dv, closing, terminal, tBurn, tBrake, dBrake, c0, accel: a, brakeAccel: b, reach };
  }

  function reachStore(sim, ship) {
    const eng = engOf(sim);
    const m = eng.reachCache || (eng.reachCache = new Map());
    let r = m.get(ship.id);
    if (!r) { r = { time: -1, targetId: 0, aim: '', out: { pd: 0, launch: null, slug: 0, beams: { nose: 0, flank: 0, tail: 0 } } }; m.set(ship.id, r); }
    return r;
  }
  // One side of the ladder: the ranges inside which this ship's mounts can touch that hull.
  function reachOne(sim, ship, target) {
    const rec = reachStore(sim, ship);
    const tid = target ? target.id : null;
    // The aim point is part of the question, so it is part of the key: picking a new aim on a
    // paused bridge has to move the ladder, not wait for the next substep.
    const aim = aimEffective(ship, target);
    if (rec.time === sim.time && rec.targetId === tid && rec.aim === aim) return rec.out;
    rec.time = sim.time; rec.targetId = tid; rec.aim = aim;
    const out = rec.out;
    out.beams.nose = 0; out.beams.flank = 0; out.beams.tail = 0;
    if (ship.destroyed || ship.disabled) { out.pd = 0; out.slug = 0; out.launch = null; return out; }
    const armour = (target ? target.armour : (OD.Ships.CLASSES[ship.cls] || {}).armour) || null;
    // The share the aim point is worth belongs in the ladder too, or the ladder and the
    // 'through armour' row disagree at the same range: precision aim that cannot beat the
    // plating has to read 'never'.
    const gain = reachGain(ship) * aimShare(aim);
    const n = countKind(ship, 'beam');
    let bi = 0;
    const rack = ship.mounts || [];
    for (let mi = 0; mi < rack.length; mi++) {
      const m = rack[mi];
      if (m.kind !== 'beam') continue;
      // The arc is not part of the question: the ladder is the range a mount bites at, and the
      // readout's '射界内光束' row is where a spinal mount off the bearing is reported.
      if (!mountLive(ship, bi++, n, mi)) continue;
      for (let f = 0; f < FACETS.length; f++) {
        const facet = FACETS[f];
        const R = beamBurnRange(ship, m, T.armourWatts * ((armour && armour[facet]) || 0), gain, target);
        if (R > out.beams[facet]) out.beams[facet] = R;
      }
    }
    out.pd = pdLive(ship) ? T.pdRange : 0;
    const coil = bestCoilgun(ship);
    out.slug = coil ? T.slugMaxFlight * coil.muzzleVelocity : 0;
    const sol = launchSolution(ship, target);
    out.launch = sol ? sol.reach : null;
    return out;
  }
  function reachWrap(sim, ship) {
    const eng = engOf(sim);
    const m = eng.reachWrap || (eng.reachWrap = new Map());
    let w = m.get(ship.id);
    if (!w) {
      w = {
        pd: 0, launch: null, slug: 0, beams: { nose: 0, flank: 0, tail: 0 },
        their: { pd: 0, launch: null, slug: 0, beams: { nose: 0, flank: 0, tail: 0 }, facet: '' },
      };
      m.set(ship.id, w);
    }
    return w;
  }
  const ZERO_BEAMS = { nose: 0, flank: 0, tail: 0 };
  const copyBeams = (dst, src) => { dst.nose = src.nose; dst.flank = src.flank; dst.tail = src.tail; };
  function reach(sim, ship, target) {
    const s = sim || simRef;
    if (!s || !ship) return null;
    const tgt = target !== undefined ? target : (ship.target ? s.byId(ship.target) : null);
    const ours = reachOne(s, ship, tgt || null);
    const w = reachWrap(s, ship);
    // Copied, not referenced: the store rewrites its record whenever the same hull is asked
    // about another target, and a second caller must not move the answer under the first.
    w.pd = ours.pd; w.launch = ours.launch; w.slug = ours.slug; copyBeams(w.beams, ours.beams);
    if (tgt) {
      const th = reachOne(s, tgt, ship);
      w.their.pd = th.pd; w.their.launch = th.launch; w.their.slug = th.slug; copyBeams(w.their.beams, th.beams);
      w.their.facet = facetSeen(tgt, ship); // the facet of ours they are looking at
    } else {
      w.their.pd = 0; w.their.launch = null; w.their.slug = 0; copyBeams(w.their.beams, ZERO_BEAMS); w.their.facet = '';
    }
    return w;
  }

  // ------------------------------------------------------------------ point defence, in numbers
  // What the mounts take off a salvo per second. They all engage the nearest dart, so the rate is
  // simply the light they put on one interceptor's cross-section over what it takes to kill it.
  function pdRate(ship) {
    if (!ship || ship.destroyed || ship.disabled || ship.weaponsInhibited) return 0;
    const n = countKind(ship, 'pd');
    if (!n) return 0;
    const gain = powerOf(ship);
    let w = 0, i = 0;
    for (let mi = 0; mi < ship.mounts.length; mi++) {
      const m = ship.mounts[mi];
      if (m.kind !== 'pd') continue;
      if (mountLive(ship, i++, n, mi)) w += pdOnTarget(ship, m, T.pdRange * 0.5) * gain;
    }
    return w / T.dartKill;
  }
  // How long a dart is inside a hull's point-defence envelope. It does not cross it at its cruise:
  // the last stretch is the terminal brake, so it comes in fast and arrives slow, and the mounts
  // get a look at it somewhere between the two. Reading the window off the cruise alone promised
  // the mounts half the time they actually have.
  function pdWindow(closing, brakeAccel) {
    const v = Math.max(T.dartTerminal, closing || 0);
    const vt = Math.min(T.dartTerminal, v);
    const b = brakeAccel > 0 ? brakeAccel : 0;
    if (!(b > 0)) return T.pdRange / Math.max(1, v);
    const dB = Math.max(0, v * v - vt * vt) / (2 * b);
    // Braking across the whole envelope: it enters at the speed that leaves it arriving at vt.
    if (dB >= T.pdRange) return (Math.sqrt(vt * vt + 2 * b * T.pdRange) - vt) / b;
    return (T.pdRange - dB) / Math.max(1, v) + (v - vt) / b;
  }
  function pdReport(ship) {
    if (!ship) return { mounts: 0, live: 0, engaging: 0, kills: 0, ratePerMin: 0 };
    const st = stateOf(ship);
    return {
      mounts: countKind(ship, 'pd'),
      live: pdLive(ship),
      engaging: st.pdEngaging || 0,
      kills: st.pdKills || 0,
      ratePerMin: pdRate(ship) * 60,
    };
  }

  // ------------------------------------------------------------------ salvos
  function salvo(sim, ship, n) {
    const s = sim || simRef;
    if (!s || !ship) return 0;
    const target = engagementTarget(s, ship);
    if (!target) { s.addLog(ship.name + '：发射舱没有目标。', 'Gunnery', 'warn'); return 0; }
    // The bays are under the same fire control as the mounts. Heat is not their problem, so the
    // beams' sink reserve is not asked of them, but everything else is.
    const why = fireReason(ship, target, true);
    if (why === OUT_OF_FIGHT) { noteHold(s, ship, target); return 0; }
    if (why) { s.addLog(ship.name + ': ' + why + '.', 'Gunnery', 'warn'); return 0; }
    // A dart finds the last few kilometres itself, but something has to point it at the right
    // patch of sky first. On anything less than a track the bays stay shut.
    if (trackQuality(s, ship, target) < T.salvoTrackQ) {
      s.addLog(ship.name + '：对 ' + target.name + ' 没有跟踪。发射舱要求跟踪质量 ' + T.salvoTrackQ + ' 才能发射。', 'Gunnery', 'warn');
      return 0;
    }
    const max = n === 'all' || n === undefined ? undefined : Math.max(1, Math.floor(n));
    const out = launchSalvo(s, ship, target, engOf(s), max);
    if (!out) s.addLog(ship.name + '：发射舱已经空了。', 'Gunnery', 'warn');
    return out;
  }
  // What a salvo of this size buys, before it leaves the rails: how long it flies, whether it can
  // reach at all, and how much of it their point defence takes out on the way in.
  function salvoEstimate(sim, ship, target, n) {
    const out = { flightTime: null, reach: false, theirPdCanStop: 0, through: 0, reason: '' };
    const s = sim || simRef;
    if (!s || !ship) return out;
    const tgt = target || engagementTarget(s, ship);
    const sol = launchSolution(ship, tgt || null);
    // Any size is a fair question up to what is on the rails — the decision layer walks the sizes
    // looking for the one that gets a dart through — and no size above that is: the bay is the cap,
    // and an estimate for twenty darts off a bay of twelve would be a promise nothing can keep.
    const aboard = bayCount(ship);
    const count = n === 'all' || n === undefined ? aboard : Math.min(aboard, Math.max(0, Math.floor(n) || 0));
    if (!sol || !tgt) return out;
    // The numbers still stand — this is what the salvo would buy — but nothing leaves the rails
    // until the track is good enough to point the darts at her.
    if (trackQuality(s, ship, tgt) < T.salvoTrackQ) out.reason = '无跟踪';
    const d = U.dist(ship.pos, tgt.pos);
    out.reach = sol.reach >= d && sol.closing > 0;
    // The burn covers ground too: charging the whole range at the post-burn speed on top of the
    // whole burn would promise half again the flight the countdown on the board is showing.
    // The burn covers ground, and so does the brake at the other end: both legs are in the flight.
    if (sol.closing > 0) {
      const cruiseD = d - sol.dBrake;
      const t = cruiseD > 0
        ? closeTime(cruiseD, sol.c0, sol.accel, sol.closing - sol.c0, sol.closing)
        : closeTime(d, sol.c0, sol.accel, sol.closing - sol.c0, sol.closing);
      out.flightTime = t === null ? null : t + (cruiseD > 0 ? sol.tBrake : 0);
    }
    const inside = Math.min(out.flightTime === null ? 0 : out.flightTime, pdWindow(sol.closing, sol.brakeAccel));
    out.theirPdCanStop = Math.min(count, Math.floor(pdRate(tgt) * inside));
    out.through = out.reach ? Math.max(0, count - out.theirPdCanStop) : 0;
    return out;
  }

  // ------------------------------------------------------------------ the advisory
  // One sentence a bridge officer would actually say, and a level the console can colour by.
  function threatSummary(sim, ship) {
    const s = sim || simRef;
    const out = { incoming: 0, slugs: 0, firstEta: null, pdMounts: 0, pdRatePerMin: 0, pdCanStop: 0, level: 'none', text: '没有来袭。' };
    if (!s || !ship) return out;
    const list = threats(s, ship);
    const rate = pdRate(ship);
    let window = 0;
    for (const r of list) {
      if (r.kind === 'interceptor') {
        out.incoming++;
        if (r.eta !== null) {
          // how long that dart will spend inside the point-defence reach before it is aboard. A
          // dart still building speed is not going to dawdle there and a dart on the brake is not
          // going to hurry, so the window is worked out from the speed it goes in at and the speed
          // it means to arrive at, not from whatever it happens to be doing this substep.
          const closing = Math.max(T.dartClosing, Math.hypot(r.vx - ship.vel.x, r.vy - ship.vel.y));
          const t = Math.min(r.eta, pdWindow(closing, r.accel));
          if (t > window) window = t;
        }
      } else if (r.willHit) out.slugs++;
      else continue;
      if (r.eta !== null && (out.firstEta === null || r.eta < out.firstEta)) out.firstEta = r.eta;
    }
    out.pdMounts = pdLive(ship);
    out.pdRatePerMin = rate * 60;
    out.pdCanStop = Math.min(out.incoming, Math.floor(rate * window));
    const through = Math.max(0, out.incoming - out.pdCanStop) + out.slugs;
    if (!out.incoming && !out.slugs) { out.level = 'none'; out.text = '没有来袭。'; return out; }
    // Nothing gets past the mounts: watch it. Something does: warn, and alert once it is close.
    const soon = out.firstEta !== null && out.firstEta < T.etaWarn;
    const close = out.firstEta !== null && out.firstEta < T.etaAlert;
    out.level = through === 0 ? (soon ? 'warn' : 'watch') : close ? 'alert' : 'warn';
    const parts = [];
    if (out.incoming) parts.push(plural(out.incoming, 'interceptor') + '来袭');
    if (out.slugs) parts.push(plural(out.slugs, 'slug') + '还在打过来');
    let text = parts.join('，');
    if (out.firstEta !== null) text += '，最近的一枚 ' + U.fmt.time(out.firstEta) + ' 后到';
    if (out.incoming) {
      // Mounts fitted but not answering — a saturated sink, an adrift hull — is 'out' 一发，不是 'gone'.
      text += out.pdMounts ? '。点防御大约能拦掉 ' + out.pdCanStop + ' 枚。'
        : countKind(ship, 'pd') ? '。点防御没有回应。' : '。这型舰体没有点防御。';
    } else text += '。';
    out.text = text;
    return out;
  }

  // ------------------------------------------------------------------ fire discipline, aim
  function fireMode(ship) { return ship ? stateOf(ship).fireMode : 'full'; }
  function setFireMode(ship, mode) {
    if (!ship) return;
    const st = stateOf(ship);
    st.fireMode = mode === 'sustained' || mode === 'hold' ? mode : 'full';
  }
  function aimPoint(ship) { return ship ? stateOf(ship).aim || 'hull' : 'hull'; }
  function setAimPoint(ship, a) {
    if (!ship) return;
    stateOf(ship).aim = a === 'radiators' || a === 'drive' || a === 'mounts' ? a : 'hull';
  }
  // What the aim came to, and why, in the words the readout uses.
  function aimLabel(ship, target) {
    const st = stateOf(ship);
    const want = st.aim || 'hull';
    const used = aimEffective(ship, target);
    if (used === want) return want;
    if (want === 'radiators') return '舰体（散热板收着）';
    if (want === 'drive') return '舰体（不在她舰尾方向）';
    return '舰体';
  }

  // ------------------------------------------------------------------ what the ship art draws
  // A snapshot of what one hull's fittings are doing this instant, for the live ship-art overlay
  // (OD.ShipArt.overlay). It reads the fight exactly as it already stands — nothing is recorded for it,
  // nothing in the fight is changed by asking, and with nobody looking it is never called. Bearings are in
  // the ship frame: 0 is the nose, positive to port. Every time is sim time, so the art ages its flashes
  // on the sim's clock and not on a wall clock: at warp 0 they hold, at 16x they are gone in a blink.
  const ARTFX = { slug: 1.6, launch: 3 };   // s a round leaving the rails and an interceptor off the bay stay worth drawing
  // Where the last round off this hull's rails went, as the art sees it: the round carries the ship's own
  // velocity, so what is left when that is taken off is the direction it was thrown.
  function artSlugBearing(eng, ship, target) {
    if (eng && eng.slugs) {
      for (let i = eng.slugs.length - 1; i >= 0; i--) {
        const s = eng.slugs[i];
        if (s.from !== ship) continue;
        const dx = s.vx - ship.vel.x, dy = s.vy - ship.vel.y;
        if (dx || dy) return U.angleDiff(Math.atan2(dy, dx), ship.heading);
      }
    }
    return target ? U.angleDiff(U.angleOf(U.sub(target.pos, ship.pos)), ship.heading) : 0;
  }
  function artFx(ship, sim) {
    const s = sim || simRef;
    const now = s ? s.time : 0;
    const out = { t: now, aim: null, mounts: [], launches: [], pd: [], vents: [] };
    if (!ship || ship.destroyed) return out;
    const eng = s && s.eng ? s.eng : null;
    const st = ship.eng || null;
    const rack = ship.mounts || [];
    const target = s ? engagementTarget(s, ship) : null;
    if (target) out.aim = U.angleDiff(U.angleOf(U.sub(target.pos, ship.pos)), ship.heading);
    // Beams are continuous: while gunnery is firing, every mount that answers and bears is lit, and the
    // mounts that answer and bear are the ones fireBeams just fired.
    if (st && st.firing > 0 && target) {
      const bearing = U.angleOf(U.sub(target.pos, ship.pos));
      const n = countKind(ship, 'beam');
      let bi = 0;
      for (let mi = 0; mi < rack.length; mi++) {
        const m = rack[mi];
        if (m.kind !== 'beam') continue;
        const idx = bi++;
        if (!mountLive(ship, idx, n, mi) || !inArc(ship, m, bearing)) continue;
        out.mounts.push({ id: mi, index: idx, kind: 'beam', arc: m.arc || 'turret', bearing: out.aim, firedAt: now });
      }
    }
    // A coilgun's own cycle is the clock: what is left of it is how long ago the round left the rail.
    let ci = 0;
    for (let mi = 0; mi < rack.length; mi++) {
      const m = rack[mi];
      if (m.kind !== 'coilgun') continue;
      const idx = ci++;
      const span = m.cycle / fireFactor(ship);   // the cycle the round was fired on, not the rated one
      if (!(m.cooldown > 0) || !(span > 0)) continue;
      const since = span - m.cooldown;
      if (since < 0 || since > ARTFX.slug) continue;
      out.mounts.push({ id: mi, index: idx, kind: 'coilgun', bearing: artSlugBearing(eng, ship, target), firedAt: now - since });
    }
    // Interceptors off this hull's rails, while they are still near enough to be part of her picture. The
    // bearing is where the dart is now, which for a dart this young is the cell it came out of.
    if (eng && eng.interceptors) {
      for (let i = 0; i < eng.interceptors.length; i++) {
        const it = eng.interceptors[i];
        if (it.from !== ship || it.dead || !(it.age < ARTFX.launch)) continue;
        out.launches.push({ t: now - it.age, bearing: U.angleDiff(U.angleOf(U.sub(it.pos, ship.pos)), ship.heading), index: null });
      }
    }
    // Point defence: the mounts that engaged this substep, on the dart they engage — the nearest hostile
    // one inside reach, which is the one every mount picks.
    if (eng && eng.interceptors && st && st.pdEngaging > 0) {
      let best = null, bd = T.pdRange;
      for (let i = 0; i < eng.interceptors.length; i++) {
        const it = eng.interceptors[i];
        if (it.dead || !s.isHostile({ faction: it.faction }, ship)) continue;   // a local side: artFx writes nothing, not even scratch
        const d = U.dist(it.pos, ship.pos);
        if (d < bd) { bd = d; best = it; }
      }
      if (best) {
        const b = U.angleDiff(U.angleOf(U.sub(best.pos, ship.pos)), ship.heading);
        const toward = { x: Math.cos(b), y: Math.sin(b) };
        const n = countKind(ship, 'pd');
        let pi = 0, lit = st.pdEngaging;
        for (let mi = 0; mi < rack.length && lit > 0; mi++) {
          const m = rack[mi];
          if (m.kind !== 'pd') continue;
          const idx = pi++;
          if (!mountLive(ship, idx, n, mi)) continue;
          out.pd.push({ t: now, index: mi, toward });
          lit--;
        }
      }
    }
    // A holed tank, and how hard it is going: the damage module owns both facts.
    if (ship.venting && Array.isArray(ship.components)) {
      let ti = 0;
      const holed = [];
      for (let i = 0; i < ship.components.length; i++) {
        const c = ship.components[i];
        if ((c.kind || '') !== 'tank') continue;
        const idx = ti++;
        if (!(c.hp < 0.5)) continue;
        if (c.share > 0 && (c.vented || 0) >= c.share - 1e-6) continue;   // holed, but there is nothing left in it
        holed.push({ tank: idx, rate: U.clamp(1 - c.hp, 0.15, 1), t: now });
      }
      for (let i = 0; i < holed.length; i++) { holed[i].of = ti; out.vents.push(holed[i]); }
    }
    return out;
  }

  OD.Engagement = {
    init, update, render, shipReadout, panelActions, onAction, physicsNotes, artFx,
    threats, threatSummary, reach, salvo, salvoEstimate, pdReport, events,
    fireMode, setFireMode, aim: aimPoint, setAim: setAimPoint,
    // shared across the module (and handy from the console while tuning)
    tuning: T,
    shared: {
      engOf, stateOf, countKind, landEnergy, landIncoming, checkWreck, burst, fireReason,
      facetSeen, armourCm, beamShot, inArc, mountLive, pointingJitter,
      fireFactor, fireWords, crewFire,
      trackQuality, trackWobble, slugReason, solutionReason, estimatedVel, trackVelErr, bestBeam,
      plumeSaturation, sinkMargin, engagementTarget, holdReason, burnHold, assess,
      holdingWreck, outOfFight, OUT_OF_FIGHT,
      kineticThrough, slugEnergy, slugArrival, slugArrivalEnergy, relEnergy, bestCoilgun,
      launchSalvo, magazine, bayCount, onDoctrine, aiLaunchRange, pdOnTarget, pdWindow, hostileToFaction,
      dartMass, dartCruise, dartBrakeAccel, burnAccel,
      powerOf, beamGain, reachGain, sustainedScale, aimEffective, aimShare, aimLabel,
      beamBurnRange, launchSolution, pdRate, pdLive, bestBay, reachOne, emit, threatCache,
      throttleFacets, throttleTip: THROTTLE_TIP, sinkWords,
      closeTime, dartEta,
    },
  };
})();
