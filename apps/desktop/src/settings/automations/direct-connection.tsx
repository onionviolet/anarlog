import { Trans, useLingui } from "@lingui/react/macro";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { Button } from "@anlg/ui/components/ui/button";
import { Input } from "@anlg/ui/components/ui/input";
import { toast } from "@anlg/ui/components/ui/toast";

import {
  deleteDirectConnection,
  saveDirectConnection,
  type DirectIntegration,
} from "~/automations/direct-connection";
import type { AutomationTargetRef } from "~/automations/types";

export function DirectConnectionChoice({
  integration,
  selected,
  onChange,
  children,
}: {
  integration: DirectIntegration;
  selected: AutomationTargetRef | null;
  onChange: (target: AutomationTargetRef) => Promise<void>;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const [direct, setDirect] = useState(!!selected?.directConnectionId);
  const save = useMutation({
    mutationFn: async (values: { token: string; destination: string }) => {
      const target = await saveDirectConnection(
        integration,
        values.destination,
        values.token,
      );
      try {
        await onChange(target);
      } catch (error) {
        await deleteDirectConnection(target.directConnectionId!);
        throw error;
      }
      return target;
    },
    onSuccess: (target) => {
      form.reset({ token: "", destination: target.id });
      toast.success(t`Direct connection saved`);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : t`Could not save the connection`,
      ),
  });
  const form = useForm({
    defaultValues: { token: "", destination: selected?.id ?? "" },
    onSubmit: ({ value }) => save.mutateAsync(value),
  });
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={!direct ? "default" : "outline"}
          onClick={() => setDirect(false)}
        >
          <Trans>Anarlog connection</Trans>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={direct ? "default" : "outline"}
          onClick={() => setDirect(true)}
        >
          <Trans>Use my own token</Trans>
        </Button>
      </div>
      {direct ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit().catch(() => {});
          }}
        >
          <p className="text-muted-foreground text-xs">
            <Trans>
              Your token stays in secure storage on this device. This automation
              sends notes directly to the destination below when enabled. No
              Anarlog sign-in is needed.
            </Trans>
          </p>
          {selected?.directConnectionId && (
            <p className="text-muted-foreground text-xs">
              <Trans>
                Connected directly to {selected.name}. Enter a token to replace
                this connection.
              </Trans>
            </p>
          )}
          <form.Field name="destination">
            {(field) => (
              <label className="flex flex-col gap-1 text-xs">
                <Trans>Destination ID</Trans>
                <Input
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder={
                    integration === "slack" ? "C0123456789" : t`Team or page ID`
                  }
                  autoComplete="off"
                  required
                />
              </label>
            )}
          </form.Field>
          <form.Field name="token">
            {(field) => (
              <label className="flex flex-col gap-1 text-xs">
                <Trans>API token</Trans>
                <Input
                  type="password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  autoComplete="off"
                  required
                />
              </label>
            )}
          </form.Field>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={save.isPending}
          >
            <Trans>Verify destination and save</Trans>
          </Button>
        </form>
      ) : (
        children
      )}
    </div>
  );
}
