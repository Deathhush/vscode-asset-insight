import {
    AssetNetValueData,
    AssetActivityData,
    AssetDailyRecordData,
    PortfolioHoldingData,
    PortfolioSummaryData
} from './interfaces';
import { PortfolioDataAccess } from './portfolioDataAccess';
import { AssetCollection } from './assetCollection';

/**
 * Represents the entire Portfolio: all assets across all accounts plus standalone assets.
 * Provides the aggregated current value and a value-over-time history, always expressed in CNY
 * (assets may use different currencies, so CNY is used as the common base).
 */
export class Portfolio {
    constructor(private dataAccess: PortfolioDataAccess) { }

    /**
     * Calculate the total current value of the whole portfolio (always in CNY).
     */
    async calculateCurrentValue(): Promise<AssetNetValueData> {
        const assets = await this.dataAccess.getAllAssets();
        return await AssetCollection.calculateCurrentValue(assets);
    }

    /**
     * Generate a full summary of the portfolio including the current total value,
     * a per-asset breakdown (holdings) and the aggregated value history over time.
     */
    async generateSummary(): Promise<PortfolioSummaryData> {
        const assets = await this.dataAccess.getAllAssets();

        const holdings: PortfolioHoldingData[] = [];
        const assetHistories: AssetDailyRecordData[][] = [];

        let totalValueInCNY = 0;
        let latestUpdateDate: string | undefined;

        for (const asset of assets) {
            try {
                const summary = await asset.generateSummary();

                // Record this asset as a holding using its current value
                holdings.push({
                    fullName: asset.fullName,
                    name: asset.name,
                    type: asset.type,
                    account: asset.accountName,
                    currentValue: summary.currentValue
                });

                // Aggregate the total current value (always in CNY)
                totalValueInCNY += summary.currentValue.valueInCNY;

                // Track the latest update date across all assets
                if (summary.currentValue.lastUpdateDate) {
                    if (!latestUpdateDate || summary.currentValue.lastUpdateDate > latestUpdateDate) {
                        latestUpdateDate = summary.currentValue.lastUpdateDate;
                    }
                }

                // Collect this asset's value history for time-series aggregation
                assetHistories.push(summary.valueHistory);
            } catch (error) {
                console.error(`Error generating summary for asset ${asset.fullName}:`, error);
            }
        }

        const currentValue: AssetNetValueData = {
            currentValue: totalValueInCNY,
            currency: 'CNY',
            valueInCNY: totalValueInCNY,
            lastUpdateDate: latestUpdateDate
        };

        // Sort holdings by value (largest first) for a more useful display
        holdings.sort((a, b) => b.currentValue.valueInCNY - a.currentValue.valueInCNY);

        const valueHistory = this.aggregateValueHistory(assetHistories);

        return {
            currentValue,
            holdings,
            valueHistory
        };
    }

    /**
     * Aggregate multiple per-asset value histories into a single portfolio value history.
     *
     * Each asset's value history only contains entries on the dates that asset changed.
     * To compute the portfolio total on any given date we carry forward each asset's most
     * recent value (in CNY) as of that date and sum across all assets. The result is the
     * union of all dates, each holding the combined portfolio value at end of that day.
     */
    private aggregateValueHistory(assetHistories: AssetDailyRecordData[][]): AssetDailyRecordData[] {
        // Collect the union of all dates across every asset's history
        const allDatesSet = new Set<string>();
        for (const history of assetHistories) {
            for (const entry of history) {
                allDatesSet.add(entry.date);
            }
        }

        // ISO date strings (YYYY-MM-DD) sort chronologically as plain strings
        const allDates = Array.from(allDatesSet).sort();
        if (allDates.length === 0) {
            return [];
        }

        // Walk every history in lock-step with the sorted date list, carrying forward
        // the last known value per asset so gaps between snapshots stay populated.
        const pointers = new Array(assetHistories.length).fill(0);
        const lastValueInCNY = new Array(assetHistories.length).fill(0);

        const aggregated: AssetDailyRecordData[] = [];

        for (const date of allDates) {
            let totalValueInCNY = 0;
            const dayActivities: AssetActivityData[] = [];

            for (let i = 0; i < assetHistories.length; i++) {
                const history = assetHistories[i];

                // Advance this asset's pointer over every entry up to and including the current date
                while (pointers[i] < history.length && history[pointers[i]].date <= date) {
                    const entry = history[pointers[i]];
                    lastValueInCNY[i] = entry.currentValue.valueInCNY;

                    // Only surface activities on the exact date they occurred
                    if (entry.date === date) {
                        dayActivities.push(...entry.activities);
                    }

                    pointers[i]++;
                }

                totalValueInCNY += lastValueInCNY[i];
            }

            aggregated.push({
                date,
                currentValue: {
                    currentValue: totalValueInCNY,
                    currency: 'CNY',
                    valueInCNY: totalValueInCNY,
                    lastUpdateDate: date
                },
                activities: dayActivities
            });
        }

        return aggregated;
    }
}
