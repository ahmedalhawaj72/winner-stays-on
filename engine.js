const E = {
  REG: 5,
  DUR: { intro: 3000, pick: 5000, reveal: 3000, kick: 5200, over: 5000 },
  fresh() {
    return { ver: 0, by: '', phase: 'idle', dur: 0, end: 0, a: null, b: null, na: '', nb: '', ka: [], kb: [],
      first: 'a', sh: 'a', id: 0, mid: '', ha: null, hb: null, log: [], last: null, q: [], w: {}, sk: 0, win: null, why: '' };
  },
  sum: k => k.reduce((n, v) => n + v, 0),
  decide(s) {
    const sa = E.sum(s.ka), sb = E.sum(s.kb), la = s.ka.length, lb = s.kb.length;
    if (la >= E.REG && lb >= E.REG) return la === lb && sa !== sb ? (sa > sb ? 'a' : 'b') : null;
    if (sa > sb + (E.REG - lb)) return 'a';
    if (sb > sa + (E.REG - la)) return 'b';
    return null;
  public/},
  enter(s, phase, now) { s.phase = phase; s.dur = E.DUR[phase] || 0; s.end = now + s.dur; },
  beginKick(s, now) {
    s.id += 1; s.ha = null; s.hb = null;
    const other = s.first === 'a' ? 'b' : 'a';
    s.sh = (s.ka.length + s.kb.length) % 2 === 0 ? s.first : other;
    E.enter(s, 'pick', now);
  },
  finish(s, w, why, now) {
    s.win = w; s.why = why;
    const name = w === 'a' ? s.na : s.nb;
    s.w[name] = (s.w[name] || 0) + 1;
    const names = Object.keys(s.w);
    if (names.length > 24) delete s.w[names.sort((x, y) => s.w[x] - s.w[y])[0]];
    s.sk = w === 'a' ? s.sk + 1 : 1;
    E.enter(s, 'over', now);
  },
  resolve(s, env, now) {
    const take = side => {
      const p = s[side], h = s['h' + side], act = env.act(p);
      if (h && act && act.id === s.id && act.h === h && env.verify(p, act) === true) return act.pick;
      return env.rand(3);
    };
    const pa = take('a'), pb = take('b');
    const shot = s.sh === 'a' ? pa : pb, dive = s.sh === 'a' ? pb : pa;
    const goal = shot !== dive;
    (s.sh === 'a' ? s.ka : s.kb).push(goal ? 1 : 0);
    s.log.push([s.sh, shot, dive]);
    s.last = { id: s.id, s: shot, d: dive, goal, sh: s.sh };
    E.enter(s, 'kick', now);
  },
  step(s, env) {
    const before = JSON.stringify(s), now = env.now;
    const on = new Map(env.roster.map(r => [r.peer, r]));
    const out = p => !p || env.gone(p);
    s.q = s.q.filter(p => !out(p));
    [...env.roster].sort((x, y) => x.since - y.since || (x.peer < y.peer ? -1 : 1)).forEach(r => {
      if (r.peer !== s.a && r.peer !== s.b && !s.q.includes(r.peer)) s.q.push(r.peer);
    });
    if (['intro', 'pick', 'reveal', 'kick'].includes(s.phase)) {
      const ao = out(s.a), bo = out(s.b);
      if (ao && bo) { s.a = null; s.b = null; s.phase = 'idle'; s.dur = 0; s.sk = 0; }
      else if (ao) E.finish(s, 'b', 'forfeit', now);
      else if (bo) E.finish(s, 'a', 'forfeit', now);
    }
    const timeUp = now >= s.end;
    if (s.phase === 'intro' && timeUp) E.beginKick(s, now);
    else if (s.phase === 'pick') {
      const aa = env.act(s.a), ab = env.act(s.b);
      const ca = aa && aa.id === s.id && typeof aa.h === 'string', cb = ab && ab.id === s.id && typeof ab.h === 'string';
      if ((ca && cb) || timeUp) {
        s.ha = ca ? aa.h : null; s.hb = cb ? ab.h : null;
        if (s.ha || s.hb) E.enter(s, 'reveal', now); else E.resolve(s, env, now);
      }
    } else if (s.phase === 'reveal') {
      const settled = side => {
        const h = s['h' + side];
        if (!h) return true;
        const act = env.act(s[side]);
        return !!act && act.h === h && act.pick !== undefined && env.verify(s[side], act) !== undefined;
      };
      if ((settled('a') && settled('b')) || timeUp) E.resolve(s, env, now);
    } else if (s.phase === 'kick' && timeUp) {
      const w = E.decide(s);
      if (w) E.finish(s, w, '', now); else E.beginKick(s, now);
    } else if (s.phase === 'over' && timeUp) {
      const winner = s[s.win], loser = s[s.win === 'a' ? 'b' : 'a'];
      if (!out(loser) && !s.q.includes(loser)) s.q.push(loser);
      s.a = out(winner) ? null : winner;
      if (!s.a) s.sk = 0;
      s.b = null; s.win = null; s.why = ''; s.phase = 'idle'; s.dur = 0;
    }
    if (s.phase === 'idle') {
      if (s.a && out(s.a)) { s.a = null; s.sk = 0; }
      if (s.b && out(s.b)) s.b = null;
      if (!s.a && s.q.length) s.a = s.q.shift();
      if (s.a && !s.b && s.q.length) s.b = s.q.shift();
      if (s.a && s.b) {
        s.na = (on.get(s.a) || {}).name || 'Player'; s.nb = (on.get(s.b) || {}).name || 'Player';
        s.ka = []; s.kb = []; s.log = []; s.last = null; s.mid = now.toString(36) + env.rand(1e6).toString(36);
        s.first = env.rand(2) ? 'a' : 'b'; s.sh = s.first;
        E.enter(s, 'intro', now);
      }
    }
    return JSON.stringify(s) !== before;
  },
};
if (typeof module !== 'undefined') module.exports = E;
