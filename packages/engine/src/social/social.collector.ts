export interface SocialRawData {
  mentions: number;
  sentiment: number;
  narrative: string;
}

export async function collectSocialData(
  _contractAddress: string,
  enabled: boolean,
): Promise<SocialRawData | null> {
  if (!enabled) return null;
  return null;
}
