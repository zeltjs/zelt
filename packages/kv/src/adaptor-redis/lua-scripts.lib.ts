export const INCR_WITH_TTL_LUA = `
  if ARGV[2] ~= '' then
    redis.call('SET', KEYS[1], 0, 'EX', ARGV[2], 'NX')
  end
  return redis.call('INCRBY', KEYS[1], ARGV[1])
`;
