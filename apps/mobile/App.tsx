/**
 * Mentivax mobile — Fees dashboard screen.
 *
 * A single-screen shell that mirrors the web app's fee overview: a branded
 * header, three summary cards (invoiced / collected / balance due) from
 * `api.payments.summary()`, and a students list from `api.students.list()`.
 * Kept deliberately minimal — this is an app shell, not a full feature.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createClient, type PaymentsSummary, type Student } from '@mentivax/api-client';
import { formatMoney } from '@mentivax/core';
import { brand, colors, fonts, radii } from '@mentivax/ui';

// NOTE: localhost only works on the iOS simulator / web. On a physical device
// or Android emulator, swap this for your machine's LAN IP, e.g.
// 'http://192.168.1.20:4000/api'.
const BASE_URL = 'http://localhost:4000/api';

const api = createClient({ baseUrl: BASE_URL });

interface DashboardData {
  summary: PaymentsSummary;
  students: Student[];
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [summary, students] = await Promise.all([
        api.payments.summary(),
        api.students.list(),
      ]);
      setData({ summary, students });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fees data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.brand}>{brand.name}</Text>
        <Text style={styles.tagline}>{brand.tagline}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.green} />
          <Text style={styles.muted}>Loading fees…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn’t load data</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : data ? (
        <FlatList
          data={data.students}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={<SummaryCards summary={data.summary} />}
          ListEmptyComponent={<Text style={styles.muted}>No students yet.</Text>}
          renderItem={({ item }) => <StudentRow student={item} />}
        />
      ) : null}
    </View>
  );
}

function SummaryCards({ summary }: { summary: PaymentsSummary }) {
  return (
    <View style={styles.cards}>
      <SummaryCard label="Total invoiced" value={summary.totalInvoiced} tone="ink" />
      <SummaryCard label="Collected" value={summary.collected} tone="green" />
      <SummaryCard label="Balance due" value={summary.balanceDue} tone="amber" />
    </View>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ink' | 'green' | 'amber';
}) {
  const valueColor =
    tone === 'green' ? colors.green : tone === 'amber' ? colors.amber : colors.ink;
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, { color: valueColor }]}>{formatMoney(value)}</Text>
    </View>
  );
}

function StudentRow({ student }: { student: Student }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{student.name}</Text>
        <Text style={styles.rowClass}>{student.className}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowPendingLabel}>Pending</Text>
        <Text
          style={[
            styles.rowPending,
            { color: student.pending > 0 ? colors.amber : colors.green },
          ]}
        >
          {formatMoney(student.pending)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    backgroundColor: colors.green,
    paddingTop: 64,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    fontFamily: fonts.ui,
  },
  tagline: {
    color: colors.greenSoft,
    fontSize: 14,
    marginTop: 2,
    fontFamily: fonts.ui,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  muted: {
    color: colors.ink2,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  errorTitle: {
    color: colors.red,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.ui,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  cards: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  cardLabel: {
    color: colors.ink2,
    fontSize: 11,
    fontFamily: fonts.ui,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
    fontFamily: fonts.ui,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  rowMain: {
    flexShrink: 1,
  },
  rowName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.ui,
  },
  rowClass: {
    color: colors.ink3,
    fontSize: 13,
    marginTop: 2,
    fontFamily: fonts.ui,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowPendingLabel: {
    color: colors.ink3,
    fontSize: 11,
    fontFamily: fonts.ui,
  },
  rowPending: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
    fontFamily: fonts.ui,
  },
});
