'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';

interface AdvisorEarningsContentProps {
  translations: {
    earnings: {
      title: string;
      thisMonth: string;
      lastMonth: string;
      lifetime: string;
      pendingPayout: string;
      nextPayout: string;
      consultations: string;
    };
  };
}

export function AdvisorEarningsContent({ translations }: AdvisorEarningsContentProps) {
  // Mock data - will be replaced with real API call
  const earningsData = {
    thisMonth: 420.00,
    lastMonth: 315.00,
    lifetime: 2850.00,
    pendingPayout: 294.00,
    nextPayout: 'Feb 1, 2025',
    consultationsThisMonth: 12
  };

  return (
    <div className="space-y-6">
      {/* Earnings Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.earnings.thisMonth}
            </CardTitle>
            <Icon name="dollar-sign" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${earningsData.thisMonth.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              +20.1% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.earnings.lastMonth}
            </CardTitle>
            <Icon name="dollar-sign" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${earningsData.lastMonth.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Previous month total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.earnings.lifetime}
            </CardTitle>
            <Icon name="trending-up" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${earningsData.lifetime.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Total lifetime earnings
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payout Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="clock" className="h-5 w-5" />
              {translations.earnings.pendingPayout}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
              ${earningsData.pendingPayout.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Will be processed on {earningsData.nextPayout}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="calendar" className="h-5 w-5" />
              {translations.earnings.consultations}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {earningsData.consultationsThisMonth}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Completed this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Payouts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Payouts</CardTitle>
          <CardDescription>
            Your recent payout history from Stripe
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Mock payout history - will be replaced with real data */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Jan 1, 2025</p>
                <p className="text-sm text-muted-foreground">Monthly payout</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-green-600 dark:text-green-400">+$315.00</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Dec 1, 2024</p>
                <p className="text-sm text-muted-foreground">Monthly payout</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-green-600 dark:text-green-400">+$280.50</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Nov 1, 2024</p>
                <p className="text-sm text-muted-foreground">Monthly payout</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-green-600 dark:text-green-400">+$195.75</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}