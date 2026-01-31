/**
 * AI Time Balance Component
 * Displays user's AI time balance, usage stats, and purchase options
 */

'use client';

import { useState } from 'react';
import { useUsageAnalytics, useFormattedEnhancedBalance } from '@/hooks/use-ai-time-balance';
import { useNavigationHelpers } from '@/utils/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Icon } from '@/components/ui/icon';
import { logger } from '@/utils/logger';

interface AITimeBalanceProps {
  userId?: string;
  showDetailed?: boolean;
  className?: string;
}

export function AITimeBalance({ 
  userId, 
  showDetailed = false, 
  className = '' 
}: AITimeBalanceProps) {
  // Use enhanced balance for richer data
  const { formattedBalance, isLoading, error, refetch } = useFormattedEnhancedBalance(userId || '');
  const { data: stats } = useUsageAnalytics(userId);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Proper i18n navigation utilities
  const { navigateToBilling } = useNavigationHelpers();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      logger.info('🔄 AI time balance refreshed');
    } catch (error) {
      logger.error('❌ Failed to refresh balance:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePurchase = () => {
    navigateToBilling();
  };

  if (error) {
    return (
      <Card className={`p-4 border-red-200 bg-red-50 ${className}`}>
        <div className="flex items-center gap-3">
          <Icon name="alert-circle" className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-800">Balance Error</p>
            <p className="text-xs text-red-600">{error instanceof Error ? error.message : String(error)}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="ml-auto"
          >
            <Icon name="refresh-cw" className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </Card>
    );
  }

  if (isLoading || !formattedBalance) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3" />
          </div>
        </div>
      </Card>
    );
  }

  // In enhanced balance, totalMinutes IS the remaining balance
  const remainingMinutes = formattedBalance.totalMinutes;

  // Usage percentage based on monthly bonus consumption
  const usagePercentage = formattedBalance.monthlyBonusCap > 0
    ? (formattedBalance.monthlyBonusUsed / formattedBalance.monthlyBonusCap) * 100
    : 0;

  const isLowBalance = remainingMinutes < 10;
  const isCriticalBalance = remainingMinutes < 2;

  // Enhanced fields from new balance format
  const planKey = formattedBalance.planKey;
  const subscriptionStatus = formattedBalance.subscriptionStatus;
  const hasActivePlan = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  
  // Plan display name mapping
  const planDisplayName = {
    'free': 'Free',
    'lite': 'Lite',
    'starter': 'Starter', 
    'builder': 'Builder',
    'pro': 'Pro',
    'ultra': 'Ultra'
  }[planKey] || planKey;

  return (
    <TooltipProvider>
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="clock" className="w-5 h-5 text-blue-500" />
            <h3 className="font-medium text-gray-900">AI Time</h3>
            {planKey && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge 
                    variant={hasActivePlan ? "default" : "outline"} 
                    className="text-xs cursor-help"
                  >
                    {planDisplayName}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm space-y-1">
                    <div className="font-medium">{planDisplayName} Plan</div>
                    <div>Status: {subscriptionStatus}</div>
                    {'nextExpiryAt' in formattedBalance && formattedBalance.nextExpiryAt && (
                      <div>Next expiry: {formattedBalance.nextExpiryAt.toLocaleDateString()}</div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="p-1 h-6 w-6"
                >
                  <Icon name="refresh-cw" className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">Refresh balance data</div>
              </TooltipContent>
            </Tooltip>
          </div>
          
          {(isLowBalance || isCriticalBalance) && (
            <Tooltip>
              <TooltipTrigger>
                <Badge 
                  variant={isCriticalBalance ? "destructive" : "secondary"}
                  className="text-xs cursor-help"
                >
                  {isCriticalBalance ? 'Critical' : 'Low Balance'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm space-y-1">
                  <div className="font-medium">
                    {isCriticalBalance ? 'Critical Balance Warning' : 'Low Balance Notice'}
                  </div>
                  <div>
                    You have {remainingMinutes} minutes remaining
                  </div>
                  <div>Consider purchasing more AI time to continue building</div>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

      <div className="space-y-3">
        {/* Main Balance Display */}
        <div className="flex items-baseline justify-between">
          <Tooltip>
            <TooltipTrigger>
              <div className="cursor-help">
                <span className="text-2xl font-bold text-gray-900">
                  {remainingMinutes}
                </span>
                <span className="text-sm text-gray-500 ml-1">min remaining</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm space-y-2">
                <div className="font-medium">Balance Composition</div>
                <div className="space-y-1">
                  <div>Total: {formattedBalance.totalMinutes}m</div>
                  <div>Paid: {formattedBalance.paidMinutes}m</div>
                  <div>Bonus: {formattedBalance.bonusMinutes}m</div>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
          <div className="text-right">
            <div className="text-sm text-gray-500">
              {formattedBalance.paidMinutes}m paid
            </div>
            <div className="text-xs text-gray-400">
              {formattedBalance.bonusMinutes}m bonus
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <Tooltip>
            <TooltipTrigger>
              <Progress 
                value={usagePercentage} 
                className="h-2 cursor-help"
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm space-y-1">
                <div className="font-medium">Monthly Bonus Usage</div>
                <div>Used: {formattedBalance.monthlyBonusUsed}m of {formattedBalance.monthlyBonusCap}m</div>
                <div>Daily bonus: {formattedBalance.dailyBonusMinutes}m/day</div>
                {formattedBalance.nextExpiryAt && (
                  <div className="border-t pt-1 mt-1">
                    Next expiry: {formattedBalance.nextExpiryAt.toLocaleDateString()}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Used: {Math.round(usagePercentage)}%</span>
            <span>Remaining: {Math.round(100 - usagePercentage)}%</span>
          </div>
        </div>

        {/* Detailed Stats (if enabled) */}
        {showDetailed && (
          <div className="border-t pt-3 space-y-3">
            {/* Balance Breakdown */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center p-2 bg-green-50 rounded" title="Total bonus minutes">
                <div className="font-medium text-green-700">
                  {formattedBalance.bonusMinutes}m
                </div>
                <div className="text-green-600">Bonus</div>
              </div>

              <div className="text-center p-2 bg-blue-50 rounded" title="Daily bonus minutes that reset">
                <div className="font-medium text-blue-700">
                  {formattedBalance.dailyBonusMinutes}m
                </div>
                <div className="text-blue-600">Daily</div>
              </div>

              <div className="text-center p-2 bg-purple-50 rounded" title="Purchased AI time minutes">
                <div className="font-medium text-purple-700">
                  {formattedBalance.paidMinutes}m
                </div>
                <div className="text-purple-600">Paid</div>
              </div>
            </div>

            {/* Monthly Bonus Tracking */}
            {formattedBalance.monthlyBonusCap > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Monthly Bonus</span>
                  <span className="text-gray-500">
                    {formattedBalance.monthlyBonusUsed}m / {formattedBalance.monthlyBonusCap}m
                  </span>
                </div>
                <div className="space-y-1">
                  <Progress
                    value={(formattedBalance.monthlyBonusUsed / formattedBalance.monthlyBonusCap) * 100}
                    className="h-2"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Used: {formattedBalance.monthlyBonusCap > 0 ? Math.round((formattedBalance.monthlyBonusUsed / formattedBalance.monthlyBonusCap) * 100) : 0}%</span>
                    <span>Remaining: {Math.max(0, formattedBalance.monthlyBonusCap - formattedBalance.monthlyBonusUsed)}m</span>
                  </div>
                </div>
              </div>
            )}

            {/* Balance Bucket Breakdown */}
            {formattedBalance.buckets && (formattedBalance.buckets.daily.length > 0 || formattedBalance.buckets.paid.length > 0) && (
              <div className="space-y-2">
                <div className="text-xs text-gray-600 font-medium">Balance Sources</div>
                <div className="space-y-1">
                  {/* Daily Bonus Buckets */}
                  {formattedBalance.buckets.daily.map((bucket, index) => (
                    <div key={`daily-${index}`} className="flex items-center justify-between text-xs bg-blue-50 px-2 py-1 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-blue-700">Daily Bonus</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600 font-medium">{bucket.minutes}m</span>
                        <span className="text-blue-500 text-xs">
                          expires {bucket.expiresAt.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Paid Balance Buckets */}
                  {formattedBalance.buckets.paid.map((bucket, index) => (
                    <div key={`paid-${index}`} className="flex items-center justify-between text-xs bg-purple-50 px-2 py-1 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        <span className="text-purple-700">{bucket.source || 'Purchased'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-purple-600 font-medium">{bucket.minutes}m</span>
                        <span className="text-purple-500 text-xs">
                          expires {bucket.expiresAt.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Expiry Information */}
            {formattedBalance.nextExpiryAt && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 flex items-center gap-1">
                  <Icon name="clock" className="w-3 h-3" />
                  Next expiry:
                </span>
                <span className="text-gray-500 font-medium">
                  {formattedBalance.nextExpiryAt.toLocaleDateString()}
                </span>
              </div>
            )}

            {/* Usage Stats */}
            {stats && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Avg/day: {stats.averagePerDay}m</span>
                <span>Lifetime: {stats.lifetimeUsed}m</span>
              </div>
            )}

            {/* Daily Bonus Info */}
            <div className="text-xs text-gray-400 text-center">
              Daily bonus: {formattedBalance.dailyBonusMinutes}m/day
            </div>
          </div>
        )}

        {/* Action Button */}
        {isLowBalance && (
          <Button
            onClick={handlePurchase}
            size="sm"
            className="w-full mt-3"
            variant={isCriticalBalance ? "default" : "outline"}
          >
            <Icon name="plus" className="w-4 h-4 mr-2" />
            Add AI Time
          </Button>
        )}
      </div>
    </Card>
    </TooltipProvider>
  );
}

/**
 * Compact version for header/navbar
 */
export function AITimeBalanceCompact({ userId, className = '' }: { userId?: string; className?: string }) {
  const { formattedBalance, isLoading } = useFormattedEnhancedBalance(userId || '');

  if (isLoading || !formattedBalance) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-4 h-4 bg-gray-200 rounded animate-pulse" />
        <div className="w-12 h-4 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  const remainingMinutes = formattedBalance.totalMinutes;
  const isLowBalance = remainingMinutes < 10;
  const isCriticalBalance = remainingMinutes < 2;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Icon 
        name="clock" 
        className={`w-4 h-4 ${
          isCriticalBalance ? 'text-red-500' : 
          isLowBalance ? 'text-yellow-500' : 
          'text-blue-500'
        }`} 
      />
      <span className={`text-sm font-medium ${
        isCriticalBalance ? 'text-red-600' : 
        isLowBalance ? 'text-yellow-600' : 
        'text-gray-700'
      }`}>
        {remainingMinutes}m
      </span>
      
      {isLowBalance && (
        <Badge 
          variant={isCriticalBalance ? "destructive" : "secondary"}
          className="text-xs px-1 py-0"
        >
          {isCriticalBalance ? '!' : 'Low'}
        </Badge>
      )}
    </div>
  );
}