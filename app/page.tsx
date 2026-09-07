import { EducationChatApp } from "@/components/education-chat-app";
import { UiLanguageProvider } from "@/components/ui-language";

export default function Home() {
  return <UiLanguageProvider><EducationChatApp /></UiLanguageProvider>;
}
