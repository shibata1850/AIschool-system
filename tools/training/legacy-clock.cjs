// Legacy demo records use October 2026. Never load this outside the isolated harness.
if (process.env.TRAINING_DB_TEST !== '1' || process.env.NODE_ENV === 'production') {
  throw new Error('Legacy clock requires isolated development tests');
}
for (const name of ['DATABASE_URL', 'DATABASE_ADMIN_URL']) {
  const url = new URL(process.env[name]);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/aischool_test') {
    throw new Error('Legacy clock requires isolated DB');
  }
}
const RealDate = Date;
const offset = RealDate.parse('2026-10-21T03:00:00Z') - RealDate.now();
globalThis.Date = new Proxy(RealDate, {
  construct(target, args, newTarget) {
    return Reflect.construct(target, args.length ? args : [RealDate.now() + offset], newTarget);
  },
  apply() {
    return new RealDate(RealDate.now() + offset).toString();
  },
  get(target, property, receiver) {
    if (property === 'now') return () => RealDate.now() + offset;
    return Reflect.get(target, property, receiver);
  },
});
