import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { AdaptiveFormField, FormField, OptionToggle } from '@/components/forms'
import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import type { ILoginGameEntryPanelProps } from '@/views/login/types/panels'

export function LoginGameEntryPanel({
  gameEntryMode,
  gameEntryModeOptions,
  onGameEntryModeChange,
  quickmatchRulesetId,
  quickmatchRulesetConfig,
  onQuickmatchRulesetChange,
  canQuickmatch,
  hostRulesetId,
  hostRulesetConfig,
  onHostRulesetChange,
  joinGameCode,
  joinGameCodeConfig,
  onJoinGameCodeChange,
  hostTimeRelaxed,
  onHostTimeRelaxedChange,
  isBusy,
  isMaintenance,
  className = '',
}: ILoginGameEntryPanelProps) {
  const { t } = useTranslation()

  return (
    <FormField className={className}>
      <OptionToggle
        ariaLabel={t('auth.gameEntryModeAria')}
        value={gameEntryMode}
        options={gameEntryModeOptions}
        optionClassName="py-1"
        onChange={onGameEntryModeChange}
      />

      {gameEntryMode === 'quickmatch' ? (
        <>
          <AdaptiveFormField
            id="quickmatchRuleset"
            value={quickmatchRulesetId}
            onValueChange={onQuickmatchRulesetChange}
            config={quickmatchRulesetConfig}
            ariaLabel={t('auth.format')}
            className="py-1.5"
          />
          <AppButton
            type="submit"
            name="intent"
            value="quickmatch"
            disabled={isBusy || !canQuickmatch || isMaintenance}
            className="w-full justify-center py-1.5"
          >
            {t('auth.findMatch')}
          </AppButton>
        </>
      ) : (
        <div className="grid grid-cols-1 items-start gap-2 min-[380px]:grid-cols-2">
          <div className="space-y-2">
            <AdaptiveFormField
              id="joinGameCode"
              value={joinGameCode}
              onValueChange={onJoinGameCodeChange}
              config={joinGameCodeConfig}
              ariaLabel={t('auth.gameCode')}
              className="py-1.5"
            />
            <AppButton
              type="submit"
              name="intent"
              value="join"
              disabled={isBusy || isMaintenance}
              className="w-full justify-center py-1.5"
            >
              {t('auth.join')}
            </AppButton>
          </div>

          <div className="space-y-2">
            <AdaptiveFormField
              id="hostRuleset"
              value={hostRulesetId}
              onValueChange={onHostRulesetChange}
              config={hostRulesetConfig}
              ariaLabel={t('auth.format')}
              className="py-1.5"
            />
            <AppButton
              type="submit"
              name="intent"
              value="host"
              disabled={isBusy || isMaintenance}
              className="w-full justify-center py-1.5"
            >
              {t('auth.host')}
            </AppButton>
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <CardAdminToggleSwitch
                checked={hostTimeRelaxed}
                onChange={onHostTimeRelaxedChange}
                ariaLabel={t('auth.hostTimeRelaxed')}
                dataTestId="host-time-relaxed"
              />
              <span>{t('auth.hostTimeRelaxed')}</span>
            </label>
          </div>
        </div>
      )}
    </FormField>
  )
}
