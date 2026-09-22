import {QuizReviewError} from './policy';

export type DecisionInput={sourceKey:string;revision:string;action:'adopt'|'withdraw';expectedToken:string|null;confirmed?:boolean};
export function decisionInput(value:unknown):DecisionInput {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new QuizReviewError('採用する結果を選び直してください');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['sourceKey','revision','action','expectedToken','confirmed'].includes(k))||
    ![v.sourceKey,v.revision].every(k=>typeof k==='string'&&/^[a-f0-9]{64}$/.test(k))||
    !['adopt','withdraw'].includes(v.action as string)||
    !(v.expectedToken===null||(typeof v.expectedToken==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.expectedToken)))||
    (v.action==='adopt'&&v.confirmed!==true))throw new QuizReviewError('Canvasでの確認と、操作する結果を確認してください');
  return v as DecisionInput;
}
export type DecisionView={token:string;state:'adopted'|'withdrawn';sourceKey:string;revision:string;decidedAt:string};
