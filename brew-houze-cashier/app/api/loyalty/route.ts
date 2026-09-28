import { NextResponse } from "next/server";
import { activeBirthdayCampaign, runningCampaign, runningRewards } from "@/lib/loyalty";
import { getSession } from "@/lib/sessions";

// The campaigns running now, for the preview in the staff app's top bar (every staff role,
// including baristas): the seasonal campaign's rules and rewards, and the birthday treat.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const [campaign, birthday] = await Promise.all([runningCampaign(), activeBirthdayCampaign()]);
    const [rewards, treats] = await Promise.all([campaign ? runningRewards(campaign.id) : [], birthday ? runningRewards(birthday.id) : []]);
    return NextResponse.json({ data: { campaign: campaign ? { ...campaign, rewards } : null, birthday: birthday ? { ...birthday, rewards: treats } : null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/loyalty (staff) failed:", error);
    return NextResponse.json({ error: "Could not load the campaigns." }, { status: 500 });
  }
}
