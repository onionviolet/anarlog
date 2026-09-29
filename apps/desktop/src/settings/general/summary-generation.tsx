import { Trans } from "@lingui/react/macro";

import { useSetSettingValue } from "~/settings/queries";
import { SettingSwitchRow } from "~/settings/setting-row";
import { useConfigValue } from "~/shared/config";

export function AutomaticSummarySetting() {
  const enabled = useConfigValue("auto_summary_after_recording");
  const setEnabled = useSetSettingValue("auto_summary_after_recording");

  return (
    <SettingSwitchRow
      title={<Trans>Generate summaries automatically</Trans>}
      description={
        <Trans>
          When off, Anarlog leaves the transcript ready for review. Generate a
          summary when you choose using the model selected under Intelligence.
        </Trans>
      }
      checked={enabled}
      onChange={setEnabled}
    />
  );
}
