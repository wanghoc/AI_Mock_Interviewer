import { ChatBubble } from "@/components/ui/chat-bubble";
import { ChatComposer } from "@/components/ui/chat-composer";

const messages = [
  {
    role: "ai" as const,
    message:
      "Xin chào! Hãy giới thiệu ngắn gọn về bản thân và lý do bạn quan tâm vị trí Frontend Engineer.",
  },
  {
    role: "user" as const,
    message:
      "Em là một Frontend Engineer với 4 năm kinh nghiệm React/Next.js, tập trung vào hiệu năng UI và trải nghiệm người dùng.",
  },
  {
    role: "ai" as const,
    message:
      "Tuyệt vời. Bạn đã từng tối ưu một màn hình có nhiều dữ liệu realtime như thế nào để vẫn giữ FPS ổn định?",
  },
  {
    role: "user" as const,
    message:
      "Em dùng virtualization, debounce các cập nhật không quan trọng và tách component để giảm re-render theo vùng.",
  },
  {
    role: "ai" as const,
    message:
      "Nếu được chọn, bạn sẽ đo lường thành công của trải nghiệm phỏng vấn AI bằng những chỉ số nào?",
  },
];

export function InterviewPanel() {
  return (
    <section className="mx-auto h-[calc(100vh-10rem)] w-full max-w-[1200px] rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] sm:p-6">
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-7">
          {messages.map((item, index) => (
            <ChatBubble key={`${item.role}-${index}`} role={item.role} message={item.message} />
          ))}
        </div>

        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <ChatComposer />
        </div>
      </div>
    </section>
  );
}
