import { expect, it } from 'vitest';
import { configFromUrl, validOutcome } from '../src/mini/config';
it('defaults and custom counts work for standalone URLs',()=>{
  expect(configFromUrl('wheel',new URLSearchParams()).prizes).toHaveLength(8);
  expect(configFromUrl('chests',new URLSearchParams('count=4')).prizes).toHaveLength(4);
  const config=configFromUrl('wheel',new URLSearchParams('mode=multiplier&baseAmount=10&amounts=1,2,5&sectors=3'));
  expect(validOutcome('wheel',config,{prizeIndex:2,amount:5,payout:50,mode:'multiplier',baseAmount:10})).toBe(true);
  expect(validOutcome('wheel',config,{prizeIndex:2,amount:5,payout:500,mode:'multiplier'})).toBe(false);
});
it('invalid counts, missing bases, malformed labels and oversized prizes are rejected',()=>{
  for(const q of ['mode=multiplier&amounts=1,2','count=4&amounts=1,2','count=20','amounts=1,,2','amounts=-1,2','amounts=1,2&labels=one','mode=multiplier&baseAmount=10000&amounts=1000000,1']) expect(()=>configFromUrl('chests',new URLSearchParams(q))).toThrow();
});
it('JSON configuration supports named wheel sectors',()=>{
  const config={mode:'instant',prizes:[{amount:10,label:'Silver'},{amount:100,label:'Gold'}]};
  expect(configFromUrl('wheel',new URLSearchParams({config:JSON.stringify(config)}))).toEqual(config);
});

it('bird ranges and mixed scratch zones validate server outcomes and complete reveal layouts',()=>{
  const birds=configFromUrl('targets',new URLSearchParams('count=4&mode=multiplier&baseAmount=10&min=2&max=8'));
  expect(validOutcome('targets',birds,{prizeIndex:0,choiceIndex:2,amount:8,payout:80,mode:'multiplier'})).toBe(true);
  expect(validOutcome('targets',birds,{prizeIndex:0,choiceIndex:2,amount:9,payout:90,mode:'multiplier'})).toBe(false);
  const scratch=configFromUrl('scratch',new URLSearchParams('amounts=25,3&modes=instant,multiplier&baseAmount=10'));
  const result={prizeIndex:1,choiceIndex:0,amount:3,payout:30,mode:'multiplier',revealedPrizes:[1,0]};
  expect(validOutcome('scratch',scratch,result)).toBe(true);
  expect(validOutcome('scratch',scratch,{...result,revealedPrizes:[0,1]})).toBe(false);
  expect(validOutcome('scratch',scratch,{...result,revealedPrizes:[1,1]})).toBe(false);
  expect(()=>configFromUrl('scratch',new URLSearchParams('amounts=25,3&modes=instant,multiplier'))).toThrow();
});

it('timed target totals allow sums beyond an individual prize and validate duration',()=>{
  const config=configFromUrl('targets',new URLSearchParams('duration=15&mode=multiplier&baseAmount=10&min=2&max=2'));
  expect(config.durationSeconds).toBe(15);
  expect(validOutcome('targets',config,{prizeIndex:0,total:true,hitCount:3,amount:6,payout:60,mode:'multiplier'})).toBe(true);
  expect(validOutcome('targets',config,{prizeIndex:0,total:true,hitCount:3,amount:6,payout:600,mode:'multiplier'})).toBe(false);
  expect(()=>configFromUrl('targets',new URLSearchParams('duration=0'))).toThrow();
  expect(()=>configFromUrl('targets',new URLSearchParams('duration=121'))).toThrow();
});
