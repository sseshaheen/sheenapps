import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Share,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { gatewayApi, type ProjectKpi, type ProjectStatus } from '@/lib/api/client';

// TODO: Get from project selection or context
const DEMO_PROJECT_ID = 'demo-project';

export default function DashboardScreen() {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: kpiData,
    isLoading: kpiLoading,
    refetch: refetchKpi,
  } = useQuery({
    queryKey: ['kpi', DEMO_PROJECT_ID],
    queryFn: () => gatewayApi.getProjectKpi(DEMO_PROJECT_ID),
    staleTime: 60 * 1000, // 1 minute
  });

  const {
    data: statusData,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['status', DEMO_PROJECT_ID],
    queryFn: () => gatewayApi.getProjectStatus(DEMO_PROJECT_ID),
    staleTime: 60 * 1000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchKpi(), refetchStatus()]);
    setRefreshing(false);
  }, [refetchKpi, refetchStatus]);

  const kpi = kpiData?.data;
  const status = statusData?.data;

  const handleOpenSite = () => {
    if (status?.url) {
      Linking.openURL(status.url);
    }
  };

  const handleShareLink = async () => {
    if (status?.url) {
      await Share.share({
        url: status.url,
        message: `Check out my website: ${status.url}`,
      });
    }
  };

  const isLoading = kpiLoading || statusLoading;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* KPI Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('dashboard.todaySummary')}</Text>

          <View style={styles.kpiGrid}>
            <KpiItem
              label={t('dashboard.revenue')}
              value={kpi?.revenue.value ?? 0}
              change={kpi?.revenue.change ?? 0}
              format="currency"
              currency={kpi?.revenue.currency ?? 'SAR'}
              isLoading={isLoading}
            />
            <KpiItem
              label={t('dashboard.newLeads')}
              value={kpi?.leads.value ?? 0}
              change={kpi?.leads.change ?? 0}
              isLoading={isLoading}
            />
            <KpiItem
              label={t('dashboard.orders')}
              value={kpi?.orders.value ?? 0}
              change={kpi?.orders.change ?? 0}
              isLoading={isLoading}
            />
          </View>
        </View>

        {/* Site Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('dashboard.siteStatus')}</Text>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                status?.isLive ? styles.statusLive : styles.statusOffline,
              ]}
            />
            <Text style={styles.statusText}>
              {status?.isLive ? t('dashboard.live') : t('dashboard.offline')}
            </Text>
          </View>

          {status?.url && (
            <Text style={styles.siteUrl} numberOfLines={1}>
              {status.url.replace(/^https?:\/\//, '')}
            </Text>
          )}

          {status?.lastDeployedAt && (
            <Text style={styles.lastUpdated}>
              {t('dashboard.lastUpdated', {
                time: formatRelativeTime(status.lastDeployedAt),
              })}
            </Text>
          )}

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleOpenSite}
              disabled={!status?.url}
            >
              <Text style={styles.actionButtonText}>
                {t('dashboard.openSite')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonSecondary]}
              onPress={handleShareLink}
              disabled={!status?.url}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  styles.actionButtonTextSecondary,
                ]}
              >
                {t('dashboard.shareLink')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface KpiItemProps {
  label: string;
  value: number;
  change?: number;
  format?: 'number' | 'currency';
  currency?: string;
  isLoading?: boolean;
}

function KpiItem({
  label,
  value,
  change,
  format = 'number',
  currency = 'SAR',
  isLoading,
}: KpiItemProps) {
  const formattedValue =
    format === 'currency'
      ? `${currency} ${value.toLocaleString()}`
      : value.toLocaleString();

  const changeDisplay = change
    ? change > 0
      ? `↑ ${change}`
      : `↓ ${Math.abs(change)}`
    : null;

  return (
    <View style={styles.kpiItem}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{isLoading ? '—' : formattedValue}</Text>
      {changeDisplay && (
        <Text
          style={[
            styles.kpiChange,
            change && change > 0 ? styles.kpiChangePositive : styles.kpiChangeNegative,
          ]}
        >
          {changeDisplay}
        </Text>
      )}
    </View>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  kpiGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kpiItem: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  kpiChange: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  kpiChangePositive: {
    color: '#059669',
  },
  kpiChangeNegative: {
    color: '#DC2626',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusLive: {
    backgroundColor: '#10B981',
  },
  statusOffline: {
    backgroundColor: '#EF4444',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  siteUrl: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  lastUpdated: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 44,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionButtonTextSecondary: {
    color: '#374151',
  },
});
