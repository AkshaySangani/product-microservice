export function validateDates(startDateStr: string, endDateStr: string): boolean {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    // Check if end date is greater than start date
    return endDate > startDate;
}