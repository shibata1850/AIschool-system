import { ChatPanel } from "./chat-panel";

export const dynamic = "force-dynamic";

/** S3 AI講師チャット（docs/画面仕様書.md S3） */
export default function ChatPage() {
  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "90vh" }}>
      <h1>AI講師に質問する</h1>
      <ChatPanel />
      <p
        aria-label="AI回答の注意"
        style={{
          marginTop: "auto",
          paddingTop: "1rem",
          color: "var(--fg-sub)",
          borderTop: "1px solid var(--fg-sub)",
        }}
      >
        AIによる回答です。判断に迷う場合は講師にご確認ください
      </p>
    </main>
  );
}
