export const ORDER_OUTCOMES = new Set(['Yes Today', 'Menu Placement']);

export function isOrderOutcome(
  outcome: string,
  includeMenuPlacementsAsOrders = false,
): boolean {
  return includeMenuPlacementsAsOrders
    ? ORDER_OUTCOMES.has(outcome)
    : outcome === 'Yes Today';
}
