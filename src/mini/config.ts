export type MiniType = 'wheel' | 'chests' | 'targets' | 'scratch';
export interface MiniConfig { durationSeconds?: number; mode: 'instant' | 'multiplier'; baseAmount?: number; targetRange?: { min: number; max: number }; prizes: { mode?: 'instant' | 'multiplier'; amount: number; label?: string }[] }
export interface MiniOutcome { total?: boolean; hitCount?: number; prizeIndex: number; choiceIndex?: number; revealedPrizes?: number[]; amount: number; payout: number; mode: MiniConfig['mode']; baseAmount?: number }
export interface TargetRound { startedAt: number; endsAt: number; activeIds: string[]; hits: {id:string;amount:number}[]; amount:number; payout:number }
export interface MiniAward { serverNow?: number; targetRound?: TargetRound; id: string; type: MiniType; status: 'pending' | 'played' | 'revoked'; config: MiniConfig; outcome?: MiniOutcome }
export function defaultConfig(type: MiniType): MiniConfig {
  return { mode: 'instant', ...(type === 'targets' ? {targetRange:{min:5,max:100}} : {}), prizes: (type === 'wheel' ? [5, 10, 15, 25, 50, 100, 10, 20] : [5, 10, 20, 30, 50, 100]).map((amount) => ({ amount })) };
}
export function validateConfig(type: MiniType, value: unknown): MiniConfig {
  const c = value as MiniConfig;
  if (!c || !['instant', 'multiplier'].includes(c.mode) || !Array.isArray(c.prizes) || c.prizes.length < 2 || c.prizes.length > (type === 'wheel' ? 16 : 12)) throw new Error(`Choose 2–${type === 'wheel' ? 16 : 12} prizes.`);
  if ((c.mode === 'multiplier' || c.prizes.some((p) => p?.mode === 'multiplier')) && (!Number.isInteger(c.baseAmount) || c.baseAmount! < 1 || c.baseAmount! > 10000)) throw new Error('Multiplier prizes require baseAmount (an integer from 1 to 10,000).');
  if (c.durationSeconds !== undefined && (!Number.isInteger(c.durationSeconds) || c.durationSeconds < 5 || c.durationSeconds > 120)) throw new Error('Round duration must be 5–120 seconds.');
  for (const p of c.prizes) {
    if (!p || !Number.isInteger(p.amount) || p.amount < 0 || p.amount > 1000000 || (p.label !== undefined && (typeof p.label !== 'string' || p.label.length > 30))) throw new Error('Prize amounts must be whole numbers from 0 to 1,000,000; labels may have up to 30 characters.');
    if (p.mode !== undefined && (type !== 'scratch' || !['instant', 'multiplier'].includes(p.mode))) throw new Error('Only scratch zones support individual instant/multiplier modes.');
    if (p.amount * ((p.mode ?? c.mode) === 'multiplier' ? c.baseAmount! : 1) > 1000000) throw new Error('A prize cannot pay more than 1,000,000 credits.');
  }
  if (c.targetRange) {
    const { min, max } = c.targetRange;
    if (type !== 'targets' || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min || max * (c.mode === 'multiplier' ? c.baseAmount! : 1) > 1000000) throw new Error('Invalid target reward range.');
  }
  return c;
}
export function configFromUrl(type: MiniType, query: URLSearchParams): MiniConfig {
  if (query.has('config')) return validateConfig(type, JSON.parse(query.get('config')!));
  const defaults = defaultConfig(type);
  const mode = query.get('mode') || defaults.mode;
  let amounts = query.has('amounts') ? query.get('amounts')!.split(',').map((v) => v.trim() === '' ? NaN : Number(v)) : defaults.prizes.map((p) => p.amount);
  const countValue = query.get(type === 'wheel' ? 'sectors' : 'count');
  if (countValue !== null) {
    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 2 || count > (type === 'wheel' ? 16 : 12)) throw new Error('Invalid sector/chest count.');
    if (query.has('amounts') && amounts.length !== count) throw new Error('Provide exactly one amount for every sector/chest.');
    if (!query.has('amounts')) amounts = Array.from({ length: count }, (_, i) => amounts[i % amounts.length]);
  }
  const modes = query.has('modes') ? query.get('modes')!.split(',') : undefined;
  if (modes && modes.length !== amounts.length) throw new Error('Provide one mode per zone.');
  const labels = query.has('labels') ? query.get('labels')!.split(',') : undefined;
  if (labels && labels.length !== amounts.length) throw new Error('Provide one label for every prize.');
  return validateConfig(type, { mode, ...(query.has('duration') ? {durationSeconds:Number(query.get('duration'))} : {}), ...(query.has('min') || query.has('max') ? {targetRange: {min: Number(query.get('min') ?? NaN), max: Number(query.get('max') ?? NaN)}} : type === 'targets' && !query.has('amounts') ? {targetRange: defaults.targetRange} : {}), ...(query.has('baseAmount') ? { baseAmount: Number(query.get('baseAmount')) } : {}), prizes: amounts.map((amount, i) => ({ amount, ...(modes ? {mode: modes[i]} : {}), ...(labels ? { label: labels[i] } : {}) })) });
}
export function validOutcome(type: MiniType, config: MiniConfig, o: unknown): o is MiniOutcome {
  if (!o || typeof o !== 'object') return false;
  const value = o as MiniOutcome;
  if (type === 'targets' && value.total) return Number.isSafeInteger(value.amount) && value.amount >= 0 && Number.isInteger(value.hitCount) && value.hitCount! >= 0 && value.mode === config.mode && value.payout === value.amount * (config.mode === 'multiplier' ? config.baseAmount! : 1);
  if (!Number.isInteger(value.prizeIndex) || value.prizeIndex < 0 || value.prizeIndex >= config.prizes.length) return false;
  const amount = config.prizes[value.prizeIndex].amount;
  const mode = config.prizes[value.prizeIndex].mode ?? config.mode;
  const range = type === 'targets' ? config.targetRange : undefined;
  if (value.revealedPrizes !== undefined && (value.revealedPrizes.length !== config.prizes.length || new Set(value.revealedPrizes).size !== config.prizes.length || value.revealedPrizes.some((i) => !Number.isInteger(i) || i < 0 || i >= config.prizes.length) || value.revealedPrizes[value.choiceIndex!] !== value.prizeIndex)) return false;
  return (range ? Number.isInteger(value.amount) && value.amount >= range.min && value.amount <= range.max : value.amount === amount) && value.mode === mode && value.payout === value.amount * (mode === 'multiplier' ? config.baseAmount! : 1) && (type === 'wheel' || (Number.isInteger(value.choiceIndex) && value.choiceIndex! >= 0 && value.choiceIndex! < config.prizes.length));
}
export function validAward(value: unknown): value is MiniAward {
  try {
    const a = value as MiniAward;
    if (!a || typeof a.id !== 'string' || !['wheel', 'chests', 'targets', 'scratch'].includes(a.type) || !['pending', 'played', 'revoked'].includes(a.status)) return false;
    validateConfig(a.type, a.config);
    if (a.targetRound && (!Array.isArray(a.targetRound.activeIds) || a.targetRound.activeIds.length < 3 || !a.targetRound.activeIds.every((id)=>typeof id === 'string') || !Array.isArray(a.targetRound.hits) || !Number.isFinite(a.targetRound.endsAt) || !Number.isSafeInteger(a.targetRound.amount) || !Number.isSafeInteger(a.targetRound.payout))) return false;
    return a.status !== 'played' || validOutcome(a.type, a.config, a.outcome);
  } catch { return false; }
}
export const prizeLabel = (config: MiniConfig, amount: number, mode = config.mode) => mode === 'multiplier' ? `×${amount}` : `${amount} cr`;
export const awardPath = (award: MiniAward) => `/${{wheel:'lucky-wheel',chests:'lucky-chests',targets:'shooting-targets',scratch:'scratch-card'}[award.type]}/?awardId=${encodeURIComponent(award.id)}`;
