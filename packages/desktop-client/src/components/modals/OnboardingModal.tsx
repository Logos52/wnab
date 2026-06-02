import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgArrowLeft } from '@actual-app/components/icons/v1';
import { Paragraph } from '@actual-app/components/paragraph';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { setHasSeenOnboarding } from '#coaching/firstRun';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useMetadataPref } from '#hooks/useMetadataPref';

type OnboardingStep = {
  id: string;
  title: string;
  body: string;
};

// The four-rule coaching tour, in wnab's own voice. Copy is original — it
// teaches the concepts (give every dollar a job; embrace your true expenses;
// roll with the punches; age your money) without reusing third-party wording.
function useOnboardingSteps(): OnboardingStep[] {
  const { t } = useTranslation();
  return [
    {
      id: 'give-every-dollar-a-job',
      title: t('Give every dollar a job'),
      body: t(
        'Budget only the money you actually have, then assign all of it until nothing is left over. When To Assign reads zero, every dollar is working for you on purpose.',
      ),
    },
    {
      id: 'embrace-your-true-expenses',
      title: t('Embrace your true expenses'),
      body: t(
        'The big, occasional bills are the ones that hurt. Break them into monthly pieces — set a little aside each month for insurance, repairs, and the holidays — so they never blindside you again.',
      ),
    },
    {
      id: 'roll-with-the-punches',
      title: t('Roll with the punches'),
      body: t(
        'You will overspend a category sometimes. That is fine. When a category goes red, move money from somewhere less urgent to cover it. Adjusting is the plan working, not the plan failing.',
      ),
    },
    {
      id: 'age-your-money',
      title: t('Age your money'),
      body: t(
        'As you keep assigning every dollar, you start spending money you earned a while ago instead of money that just arrived. The older your money gets, the calmer your finances feel.',
      ),
    },
  ];
}

export function OnboardingModal() {
  const { t } = useTranslation();
  const [budgetId] = useMetadataPref('id');
  const steps = useOnboardingSteps();
  const [stepIndex, setStepIndex] = useState(0);

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;
  const currentStep = steps[stepIndex];

  const finish = (state: { close: () => void }) => {
    setHasSeenOnboarding(budgetId);
    state.close();
  };

  return (
    <Modal
      name="onboarding"
      containerProps={{ style: { width: 520 } }}
      onClose={() => setHasSeenOnboarding(budgetId)}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Welcome to wnab')}
            leftContent={
              isFirstStep ? null : (
                <Button
                  variant="bare"
                  onPress={() => setStepIndex(index => index - 1)}
                  style={{ marginRight: 10, marginLeft: 15 }}
                >
                  <SvgArrowLeft
                    width={10}
                    height={10}
                    style={{ marginRight: 5, color: 'currentColor' }}
                  />
                  <Trans>Back</Trans>
                </Button>
              )
            }
            rightContent={
              <ModalCloseButton onPress={() => finish(state)} />
            }
          />
          <View style={{ padding: '0 20px 20px 20px' }}>
            <View
              style={{
                flexDirection: 'row',
                gap: 6,
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              {steps.map((step, index) => (
                <View
                  key={step.id}
                  style={{
                    width: index === stepIndex ? 22 : 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor:
                      index === stepIndex
                        ? theme.pageTextPositive
                        : theme.pageTextSubdued,
                  }}
                />
              ))}
            </View>

            <Text
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: theme.pageText,
                marginBottom: 8,
                textAlign: 'center',
              }}
            >
              {currentStep.title}
            </Text>
            <Paragraph
              style={{
                color: theme.pageTextLight,
                textAlign: 'center',
                minHeight: 96,
              }}
            >
              {currentStep.body}
            </Paragraph>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              <Button variant="bare" onPress={() => finish(state)}>
                {isLastStep ? <Trans>Close</Trans> : <Trans>Skip</Trans>}
              </Button>
              {isLastStep ? (
                <Button variant="primary" onPress={() => finish(state)}>
                  <Trans>Let's go</Trans>
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onPress={() => setStepIndex(index => index + 1)}
                >
                  <Trans>Next</Trans>
                </Button>
              )}
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
