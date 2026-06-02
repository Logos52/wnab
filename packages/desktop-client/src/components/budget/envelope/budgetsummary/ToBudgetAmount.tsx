import React from 'react';
import type { CSSProperties, MouseEventHandler } from 'react';
import { useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import { getToAssignNudge } from '#coaching/nudges';
import {
  useEnvelopeSheetName,
  useEnvelopeSheetValue,
} from '#components/budget/envelope/EnvelopeBudgetComponents';
import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { envelopeBudget } from '#spreadsheet/bindings';

import { TotalsList } from './TotalsList';

type ToBudgetAmountProps = {
  prevMonthName: string;
  style?: CSSProperties;
  amountStyle?: CSSProperties;
  onClick: () => void;
  onContextMenu?: MouseEventHandler;
  isTotalsListTooltipDisabled?: boolean;
};

export function ToBudgetAmount({
  prevMonthName,
  style,
  amountStyle,
  onClick,
  isTotalsListTooltipDisabled = false,
  onContextMenu,
}: ToBudgetAmountProps) {
  const { t } = useTranslation();
  const sheetName = useEnvelopeSheetName(envelopeBudget.toBudget);
  const sheetValue = useEnvelopeSheetValue({
    name: envelopeBudget.toBudget,
    value: 0,
  });
  const format = useFormat();
  const availableValue = sheetValue;
  if (typeof availableValue !== 'number' && availableValue !== null) {
    throw new Error(
      'Expected availableValue to be a number but got ' + availableValue,
    );
  }
  const num = availableValue ?? 0;
  const isNegative = num < 0;
  const isPositive = num > 0;

  return (
    <View style={{ alignItems: 'center', ...style }}>
      <Block>{isNegative ? t('Over-assigned:') : t('To Assign:')}</Block>
      <View>
        <Tooltip
          content={
            <TotalsList
              prevMonthName={prevMonthName}
              style={{
                padding: 7,
              }}
            />
          }
          placement="bottom"
          offset={3}
          triggerProps={{ isDisabled: isTotalsListTooltipDisabled }}
        >
          <PrivacyFilter
            style={{
              textAlign: 'center',
            }}
          >
            <Block
              onClick={onClick}
              onContextMenu={onContextMenu}
              data-cellname={sheetName}
              className={css([
                styles.veryLargeText,
                {
                  // wnab: YNAB-style filled "Ready to Assign" banner pill
                  fontWeight: 700,
                  userSelect: 'none',
                  cursor: 'pointer',
                  padding: '4px 18px',
                  borderRadius: 999,
                  color: isPositive
                    ? '#1e7a3d'
                    : isNegative
                      ? '#c0341d'
                      : '#4b5563',
                  backgroundColor: isPositive
                    ? '#e3f3e8'
                    : isNegative
                      ? '#fdeaea'
                      : '#eef0f3',
                  ':hover': { filter: 'brightness(0.97)' },
                },
                amountStyle,
              ])}
            >
              <FinancialText>{format(num, 'financial')}</FinancialText>
            </Block>
          </PrivacyFilter>
        </Tooltip>
      </View>
      <Block
        className={css([
          styles.smallText,
          {
            marginTop: 3,
            maxWidth: 240,
            textAlign: 'center',
            color: theme.pageTextLight,
          },
        ])}
      >
        {/* wnab coaching nudge — copy lives in #coaching/nudges */}
        {getToAssignNudge(num, t)}
      </Block>
    </View>
  );
}
