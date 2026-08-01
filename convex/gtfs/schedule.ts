const GTFS_DATE_PATTERN = /^\d{8}$/;
const HST_OFFSET_MS = 10 * 60 * 60 * 1_000;

const formatHstDate = (timestamp: number) => {
  const hstDate = new Date(timestamp - HST_OFFSET_MS);
  const year = hstDate.getUTCFullYear();
  const month = String(hstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(hstDate.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

export const hasFeedExpiredInHst = (feedEndDate: string, timestamp: number) => {
  if (!GTFS_DATE_PATTERN.test(feedEndDate)) {
    throw new Error(
      `Invalid GTFS feed_end_date "${feedEndDate}"; expected YYYYMMDD`,
    );
  }
  return formatHstDate(timestamp) >= feedEndDate;
};
