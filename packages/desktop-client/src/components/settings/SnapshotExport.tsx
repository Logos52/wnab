import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ButtonWithLoading } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';

import { useMetadataPref } from '#hooks/useMetadataPref';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

import { buildWnabSnapshot } from './exportWnabSnapshot';
import { Setting } from './UI';

export function SnapshotExport() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [budgetName] = useMetadataPref('budgetName');
  const [defaultCurrencyCode] = useSyncedPref('defaultCurrencyCode');

  async function onExport() {
    setIsLoading(true);

    try {
      const snapshot = await buildWnabSnapshot({
        budgetName: budgetName ?? '',
        currency: defaultCurrencyCode || 'USD',
      });
      await window.Actual.saveWnabSnapshot(JSON.stringify(snapshot, null, 2));

      dispatch(
        addNotification({
          notification: {
            type: 'message',
            title: t('Snapshot exported'),
            message: t(
              'Wrote snapshot.json to your wnab finances folder for the Obsidian overview.',
            ),
          },
        }),
      );
    } catch (error) {
      console.error('wnab snapshot export failed:', error);
      dispatch(
        addNotification({
          notification: {
            type: 'error',
            title: t('Snapshot export failed'),
            message:
              error instanceof Error
                ? error.message
                : t('An unknown error occurred while exporting the snapshot.'),
          },
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Setting
      primaryAction={
        <ButtonWithLoading onPress={onExport} isLoading={isLoading}>
          <Trans>Export wnab snapshot</Trans>
        </ButtonWithLoading>
      }
    >
      <Text>
        <Trans>
          <strong>Export a wnab snapshot</strong> — a single{' '}
          <code>snapshot.json</code> written to your finances folder that the
          Obsidian overview reads. It captures this month's budget, accounts,
          age of money, recent transactions, upcoming bills, and category
          history. It contains no secrets and is never synced.
        </Trans>
      </Text>
    </Setting>
  );
}
