import DashboardClient from "../dashboard-client";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireChatGPTUser("/app");
  return <DashboardClient identity={{ userId: user.userId, email: user.email, displayName: user.displayName }} />;
}
