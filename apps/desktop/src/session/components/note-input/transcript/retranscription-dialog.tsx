import { Trans, useLingui } from "@lingui/react/macro";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef } from "react";

import {
  commands as localSttCommands,
  type LocalModel,
} from "@anlg/plugin-local-stt";
import { commands as transcriptionCommands } from "@anlg/plugin-transcription";
import { Button } from "@anlg/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@anlg/ui/components/ui/dialog";
import { Input } from "@anlg/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@anlg/ui/components/ui/select";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import { useRegenerateTranscript } from "./actions";

import { useConfiguredMapping } from "~/settings/ai/stt/select";
import { PROVIDERS, type ProviderId } from "~/settings/ai/stt/shared";
import {
  CORE_TRANSCRIPTION_LANGUAGE_CODES,
  getBaseLanguageDisplayName,
} from "~/settings/general/language";
import { useAiProvidersState } from "~/settings/providers";
import { useConfigValues } from "~/shared/config";
import {
  getTranscriptionLanguages,
  isLocalFileSttModel,
  isOnDeviceSttModel,
} from "~/stt/capabilities";
import { getBatchProvider } from "~/stt/useRunBatch";

export function RetranscriptionDialog({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const { i18n, t } = useLingui();
  const mapping = useConfiguredMapping();
  const { providers: credentials } = useAiProvidersState("stt");
  const config = useConfigValues([
    "current_stt_provider",
    "current_stt_model",
    "ai_language",
    "spoken_languages",
    "local_stt_model_path",
  ] as const);
  const regenerate = useRegenerateTranscript(sessionId);
  const controller = useRef<AbortController | null>(null);
  useMountEffect(() => () => controller.current?.abort());
  const form = useForm({
    defaultValues: {
      provider: config.current_stt_provider ?? "",
      model: config.current_stt_model ?? "",
      language: "settings",
    },
  });
  const mutation = useMutation({
    mutationFn: async ({
      provider,
      model,
      languages,
    }: {
      provider: string;
      model: string;
      languages: string[];
    }) => {
      controller.current = new AbortController();
      const signal = controller.current.signal;
      const definition = PROVIDERS.find((entry) => entry.id === provider);
      const credential = credentials[`stt:${provider}`];
      let baseUrl = credential?.base_url?.trim() || definition?.baseUrl || "";
      const apiKey = credential?.api_key?.trim() || "";
      if (
        isLocalFileSttModel(provider, model) ||
        isOnDeviceSttModel(provider, model)
      ) {
        const local = isLocalFileSttModel(provider, model)
          ? await localSttCommands.startServerForPath(
              config.local_stt_model_path ?? "",
            )
          : await localSttCommands.startServer(model as LocalModel);
        if (local.status === "error") throw new Error(local.error);
        baseUrl = local.data;
      }
      signal.throwIfAborted();
      return regenerate({
        provider,
        model,
        languages,
        baseUrl,
        apiKey,
        signal,
      });
    },
    onSuccess: (completed) => {
      if (completed) onClose();
    },
  });
  const close = () => {
    controller.current?.abort();
    onClose();
  };
  const providerOptions = PROVIDERS.filter(
    (entry) => !entry.disabled && mapping.providers[entry.id]?.configured,
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Trans>Re-transcribe</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Choose settings for this recording. Your default settings stay the
              same. The saved transcript is replaced only after transcription
              succeeds.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <form.Subscribe selector={(state) => state.values}>
          {(values) => {
            const models =
              mapping.providers[values.provider as ProviderId]?.models.filter(
                (model) =>
                  model.isDownloaded &&
                  model.mode !== "realtime" &&
                  !model.isDeprecated,
              ) ?? [];
            const selectedModelAvailable =
              values.provider === "custom"
                ? !!values.model.trim()
                : models.some((model) => model.id === values.model);
            const local =
              isOnDeviceSttModel(values.provider, values.model) ||
              isLocalFileSttModel(values.provider, values.model);
            const languages =
              values.language === "settings"
                ? getTranscriptionLanguages(
                    config.ai_language,
                    config.spoken_languages,
                  )
                : [values.language];
            return (
              <RetranscriptionFields
                provider={values.provider}
                model={values.model}
                language={values.language}
                languages={languages}
                valid={
                  mapping.isReady &&
                  selectedModelAvailable &&
                  !!getBatchProvider(values.provider, values.model)
                }
                pending={mutation.isPending}
                local={local}
                error={mutation.error}
                providerOptions={providerOptions.map((entry) => ({
                  id: entry.id,
                  label: entry.displayName,
                }))}
                models={models.map((entry) => ({
                  id: entry.id,
                  label: entry.displayName ?? entry.id,
                }))}
                locale={i18n.locale}
                onProviderChange={(provider) => {
                  const nextModels =
                    mapping.providers[provider as ProviderId]?.models ?? [];
                  form.setFieldValue("provider", provider);
                  form.setFieldValue(
                    "model",
                    nextModels.find(
                      (entry) =>
                        entry.isDownloaded &&
                        entry.mode !== "realtime" &&
                        !entry.isDeprecated,
                    )?.id ?? "",
                  );
                  mutation.reset();
                }}
                onModelChange={(model) => {
                  form.setFieldValue("model", model);
                  mutation.reset();
                }}
                onLanguageChange={(language) => {
                  form.setFieldValue("language", language);
                  mutation.reset();
                }}
                onStart={() =>
                  mutation.mutate({
                    provider: values.provider,
                    model: values.model,
                    languages,
                  })
                }
                onClose={close}
                settingsLabel={`${t`Use default languages`} (${getTranscriptionLanguages(
                  config.ai_language,
                  config.spoken_languages,
                )
                  .map((code) => getBaseLanguageDisplayName(code, i18n.locale))
                  .join(", ")})`}
              />
            );
          }}
        </form.Subscribe>
      </DialogContent>
    </Dialog>
  );
}

function RetranscriptionFields({
  provider,
  model,
  language,
  languages,
  valid,
  pending,
  local,
  error,
  providerOptions,
  models,
  locale,
  onProviderChange,
  onModelChange,
  onLanguageChange,
  onStart,
  onClose,
  settingsLabel,
}: {
  provider: string;
  model: string;
  language: string;
  languages: string[];
  valid: boolean;
  pending: boolean;
  local: boolean;
  error: Error | null;
  providerOptions: { id: string; label: string }[];
  models: { id: string; label: string }[];
  locale: string;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onStart: () => void;
  onClose: () => void;
  settingsLabel: string;
}) {
  const batchProvider = getBatchProvider(provider, model);
  const support = useQuery({
    queryKey: [
      "retranscription-language-support",
      batchProvider,
      model,
      languages,
    ],
    enabled: valid && !!batchProvider,
    queryFn: async () => {
      const result = await transcriptionCommands.isSupportedLanguagesBatch(
        batchProvider === "applespeech"
          ? "apple-speech"
          : batchProvider === "whispercpp"
            ? "anarlog"
            : batchProvider!,
        model,
        languages,
      );
      if (result.status === "error") throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <Trans>Provider</Trans>
        <Select
          value={provider}
          onValueChange={onProviderChange}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <Trans>Model</Trans>
        {provider === "custom" ? (
          <Input
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={pending}
          />
        ) : (
          <Select
            value={model}
            onValueChange={onModelChange}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <Trans>Language</Trans>
        <Select
          value={language}
          onValueChange={onLanguageChange}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="settings">{settingsLabel}</SelectItem>
            {CORE_TRANSCRIPTION_LANGUAGE_CODES.map((code) => (
              <SelectItem key={code} value={code}>
                {getBaseLanguageDisplayName(code, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <p className="text-muted-foreground text-sm">
        {local ? (
          <Trans>This recording stays on this device.</Trans>
        ) : (
          <Trans>This recording will be sent to the selected provider.</Trans>
        )}
      </p>
      {!valid && (
        <p role="status" className="text-sm">
          <Trans>
            Choose a configured batch model. Download local models in
            transcription settings first.
          </Trans>
        </p>
      )}
      {support.error && (
        <p role="alert" className="text-sm">
          <Trans>Could not check language support.</Trans>{" "}
          {support.error.message}
        </p>
      )}
      {support.data === false && (
        <p role="alert" className="text-sm">
          <Trans>This model does not support the selected languages.</Trans>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {pending ? <Trans>Stop</Trans> : <Trans>Cancel</Trans>}
        </Button>
        <Button
          disabled={!valid || support.data !== true || pending}
          onClick={onStart}
        >
          {pending ? (
            <Trans>Transcribing…</Trans>
          ) : (
            <Trans>Re-transcribe</Trans>
          )}
        </Button>
      </div>
    </div>
  );
}
