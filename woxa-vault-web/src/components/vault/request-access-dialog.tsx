"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/provider";
import { createAccessRequest, type AccessRequestTarget } from "@/lib/api/access-requests";
import { ApiError } from "@/lib/api/client";

interface RequestAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetId: string;
  targetName: string;
  targetType: AccessRequestTarget;
}

export function RequestAccessDialog({
  open,
  onOpenChange,
  targetId,
  targetName,
  targetType,
}: RequestAccessDialogProps) {
  const t = useT();
  const [role, setRole] = useState<string>("user");
  const [days, setDays] = useState<string>("");
  const [hours, setHours] = useState<string>("");
  const [minutes, setMinutes] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    let totalMinutes: number | null = null;
    const d = parseInt(days || "0", 10);
    const h = parseInt(hours || "0", 10);
    const m = parseInt(minutes || "0", 10);
    
    if (d > 0 || h > 0 || m > 0) {
      totalMinutes = (d * 1440) + (h * 60) + m;
    }

    setBusy(true);
    try {
      await createAccessRequest({
        targetId,
        targetType,
        requestedRole: role,
        durationMinutes: totalMinutes,
        reason,
      });
      toast.success(t("requests.toast.created"));
      onOpenChange(false);
      setReason("");
      setDays("");
      setHours("");
      setMinutes("");
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : t("api.error.generic");
      toast.error(t("api.error.save_failed"), { description });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("requests.modal.title")}</DialogTitle>
            <DialogDescription>
              {t("requests.modal.desc", { name: targetName })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="requested-role">{t("requests.modal.role_label")}</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v)}>
                <SelectTrigger id="requested-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("role.user")}</SelectItem>
                  <SelectItem value="editor">{t("role.editor")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{t("requests.modal.duration_label")}</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="days" className="text-[10px] text-muted-foreground uppercase">{t("requests.modal.duration_days")}</Label>
                  <Input
                    id="days"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="hours" className="text-[10px] text-muted-foreground uppercase">{t("requests.modal.duration_hours")}</Label>
                  <Input
                    id="hours"
                    type="number"
                    min="0"
                    max="23"
                    placeholder="0"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="minutes" className="text-[10px] text-muted-foreground uppercase">{t("requests.modal.duration_minutes")}</Label>
                  <Input
                    id="minutes"
                    type="number"
                    min="0"
                    max="59"
                    placeholder="0"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {t("requests.modal.duration_hint")}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">{t("requests.modal.reason_label")}</Label>
              <Textarea
                id="reason"
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("requests.modal.submitting")}
                </>
              ) : (
                t("requests.modal.submit")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
