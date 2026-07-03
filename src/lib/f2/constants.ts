/**
 * F2 AIチャットの共有定数。
 * クライアント（chat-panel）とサーバー（tutor）の両方がここを参照し、
 * 上限値の二重定義による食い違いを防ぐ（2026-07-03 監査指摘の修正）。
 */
export const QUESTION_LIMIT = 2000;
