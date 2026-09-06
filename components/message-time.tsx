import { memo } from "react";
import { messageTime } from "@/lib/learning/message-time";

export const MessageTime = memo(function MessageTime({ createdAt }: { createdAt: string }) {
  const time = messageTime(createdAt);
  return time
    ? <time className="chat-message-time" dateTime={time.dateTime} title={time.label} aria-label={`消息时间：${time.label}`}>{time.clock}</time>
    : <span className="chat-message-time">时间未记录</span>;
});
