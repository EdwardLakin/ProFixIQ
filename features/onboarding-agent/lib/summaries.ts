export function toCountMap(rows: Array<{ key: string; count: number }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.key] = row.count;
    return acc;
  }, {});
}
