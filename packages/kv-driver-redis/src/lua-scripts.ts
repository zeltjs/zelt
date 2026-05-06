/** 最初の incr 時にのみ EXPIRE を発行 (TTL 延長を防ぐ) */
export const INCR_WITH_TTL_LUA = `
  local v = redis.call('INCRBY', KEYS[1], ARGV[1])
  if v == tonumber(ARGV[1]) and ARGV[2] ~= '' then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
  end
  return v
`;

/** SET NX EX を 1 コマンドで (NX と EX の race を回避) */
export const SETNX_WITH_TTL_LUA = `
  if redis.call('EXISTS', KEYS[1]) == 1 then
    return 0
  end
  if ARGV[2] ~= '' then
    redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  else
    redis.call('SET', KEYS[1], ARGV[1])
  end
  return 1
`;

/** 値一致時のみ削除 (lock release で他人の lock を消さない) */
export const DEL_IF_LUA = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;
