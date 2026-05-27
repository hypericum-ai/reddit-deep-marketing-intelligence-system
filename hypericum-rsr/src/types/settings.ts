export type SubredditConfig = {
  minIntentScore: number;
  minTextLength: number;
  /** `*` means all categories; otherwise slug list from clustering config */
  enabledCategories: string[] | '*';
};

export const DEFAULT_SUBREDDIT_CONFIG: SubredditConfig = {
  minIntentScore: 30,
  minTextLength: 40,
  enabledCategories: '*',
};

export function categoryAllowed(
  config: SubredditConfig,
  category: string
): boolean {
  if (config.enabledCategories === '*') {
    return true;
  }
  return config.enabledCategories.includes(category.toLowerCase());
}
