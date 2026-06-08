"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Inbox,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MoreHorizontal,
  Check,
  X,
  User,
  ShieldCheck,
  Calendar,
  Loader2,
  Info,
} from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Separator } from "@/components/ui/separator";
import { ApiErrorState, ApiLoadingState } from "@/components/shared/api-states";
import {
  listAccessRequests,
  decideAccessRequest,
  type AccessRequest,
  type AccessRequestStatus,
} from "@/lib/api/access-requests";
import { ApiError, VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { isWorkspaceAdmin } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export default function RequestsPage() {
  const t = useT();
  const { me } = useAuth();
  const isAdmin = isWorkspaceAdmin(me?.role ?? null);

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const [tab, setTab] = useState<"inbox" | "outbox">("outbox");

  // Admins start on Inbox if there are pending items, else Outbox.
  useEffect(() => {
    if (isAdmin) setTab("inbox");
  }, [isAdmin]);

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<AccessRequest | null>(null);
  const [decisionType, setDecisionType] = useState<"approved" | "denied">("approved");

  const [viewReasonOpen, setViewReasonOpen] = useState(false);
  const [viewRequest, setViewRequest] = useState<AccessRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAccessRequests();
      setRequests(res.requests);
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      else setError(new ApiError(0, "network_error", "Network error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Recover on unlock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => void load();
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [load]);

  const handleOpenDecision = (req: AccessRequest, type: "approved" | "denied") => {
    setActiveRequest(req);
    setDecisionType(type);
    setDecisionOpen(true);
  };

  const handleOpenViewReason = (req: AccessRequest) => {
    setViewRequest(req);
    setViewReasonOpen(true);
  };

  const handleDecisionSaved = () => {
    setDecisionOpen(false);
    setActiveRequest(null);
    void load();
  };

  const inbox = requests.filter((r) => r.requesterId !== me?.id && r.status === "pending");
  const outbox = requests.filter((r) => r.requesterId === me?.id);
  const filtered = tab === "inbox" ? inbox : outbox;

  return (
    <>
      <Topbar
        title={t("requests.title")}
        subtitle={t("requests.subtitle")}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8">
          {loading ? (
            <ApiLoadingState />
          ) : error ? (
            <ApiErrorState error={error} onRetry={load} />
          ) : (
            <div className="space-y-6">
              {isAdmin && (
                <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg border border-line-1 w-fit">
                  <button
                    onClick={() => setTab("inbox")}
                    className={cn(
                      "px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2",
                      tab === "inbox"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t("requests.tab.inbox")}
                    {inbox.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px]">
                        {inbox.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setTab("outbox")}
                    className={cn(
                      "px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2",
                      tab === "outbox"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t("requests.tab.outbox")}
                  </button>
                </div>
              )}

              {filtered.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center px-6">
                  <div className="size-16 rounded-3xl bg-surface-1 border border-line-1 flex items-center justify-center mb-6">
                    <Inbox className="size-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {tab === "inbox" ? t("requests.empty.inbox_title") : t("requests.empty.outbox_title")}
                  </h3>
                  <p className="text-muted-foreground max-w-sm">
                    {tab === "inbox" ? t("requests.empty.inbox_desc") : t("requests.empty.outbox_desc")}
                  </p>
                </div>
              ) : (
                <Card className="overflow-hidden p-0">
                  <table className="w-full text-sm border-collapse">
                    <thead className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-1">
                      <tr>
                        <th className="text-left font-semibold px-6 py-3 min-w-[200px]">
                          {t("requests.col.target")}
                        </th>
                        {tab === "inbox" && (
                          <th className="text-left font-semibold px-2 py-3 min-w-[150px]">
                            {t("requests.col.requester")}
                          </th>
                        )}
                        <th className="text-center font-semibold px-4 py-3 w-[140px]">
                          {t("requests.col.requested_role")}
                        </th>
                        <th className="text-center font-semibold px-4 py-3 w-[140px]">
                          {t("requests.col.status")}
                        </th>
                        <th className="text-center font-semibold px-4 py-3 w-[180px]">
                          {t("requests.col.created_at")}
                        </th>
                        {tab === "inbox" && isAdmin && (
                          <th className="text-center font-semibold px-6 py-3 w-[140px]">
                            {t("requests.col.actions")}
                          </th>
                        )}
                        {tab === "outbox" && (
                          <th className="text-center font-semibold px-6 py-3 w-[140px]">
                            {t("requests.col.actions")}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filtered.map((req) => (
                        <tr
                          key={req.id}
                          className="hover:bg-muted/30 transition-colors h-[72px]"
                        >
                          <td className="px-6 py-4 align-middle">
                            <div className="font-medium text-foreground">
                              {req.targetName || req.targetId}
                            </div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              {req.targetType}
                            </div>
                          </td>
                          {tab === "inbox" && (
                            <td className="px-2 py-4 align-middle">
                              <div className="flex items-center gap-2">
                                <div className="size-6 rounded-full bg-surface-3 flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                                  {(req.requesterDisplayName || req.requesterId)[0]}
                                </div>
                                <div className="min-w-0 flex flex-col">
                                  <span className="text-xs font-medium text-foreground truncate">
                                    {req.requesterDisplayName}
                                  </span>
                                  {req.requesterEmail && (
                                    <span className="text-[10px] text-muted-foreground truncate">
                                      {req.requesterEmail}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-4 align-middle text-center">
                            <Badge variant="outline" className="capitalize">
                              {t(`role.${req.requestedRole}`)}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 align-middle text-center">
                            <StatusBadge status={req.status} />
                          </td>
                          <td className="px-4 py-4 align-middle text-center text-xs text-muted-foreground whitespace-nowrap">
                            <div className="font-semibold text-foreground/80">
                              {timeAgo(req.createdAt)}
                            </div>
                            <div className="text-[10px] tabular-nums">
                              {formatDateTime(req.createdAt)}
                            </div>
                          </td>
                          <td className="px-6 py-4 align-middle text-center">
                            {tab === "inbox" && isAdmin && req.status === "pending" && (
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-3 border-rose-500/20 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                                  onClick={() => handleOpenDecision(req, "denied")}
                                >
                                  <X className="size-3.5 mr-1" />
                                  {t("requests.action.deny")}
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-8 px-3 bg-emerald-600 text-white hover:bg-emerald-700"
                                  onClick={() => handleOpenDecision(req, "approved")}
                                >
                                  <Check className="size-3.5 mr-1" />
                                  {t("requests.action.approve")}
                                </Button>
                              </div>
                            )}
                            {tab === "outbox" && req.status !== "pending" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenViewReason(req)}
                              >
                                <Info className="size-3.5" />
                                {t("requests.action.view_reason")}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {activeRequest && (
        <DecisionDialog
          open={decisionOpen}
          onOpenChange={setDecisionOpen}
          request={activeRequest}
          type={decisionType}
          onSaved={handleDecisionSaved}
        />
      )}

      {viewRequest && (
        <ViewDecisionDialog
          open={viewReasonOpen}
          onOpenChange={setViewReasonOpen}
          request={viewRequest}
        />
      )}
    </>
  );
}

function ViewDecisionDialog({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: AccessRequest;
}) {
  const t = useT();
  const isApproved = request.status === "approved";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isApproved ? (
              <CheckCircle2 className="size-5 text-emerald-500" />
            ) : (
              <XCircle className="size-5 text-rose-500" />
            )}
            {isApproved ? t("requests.status.approved") : t("requests.status.denied")}
          </DialogTitle>
          <DialogDescription>
            {t("requests.view_desc", { name: request.targetName || request.targetId })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isApproved && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  {t("requests.modal.approved_role")}
                </span>
                <p className="text-sm font-medium capitalize">
                  {t(`role.${request.approvedRole || request.requestedRole}`)}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  {t("requests.modal.approved_duration")}
                </span>
                <p className="text-sm font-medium">
                  {formatDuration(request.approvedDurationMinutes, t)}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              {t("requests.col.reason")}
            </span>
            <div className="p-3 rounded-lg bg-surface-2 border border-line-1 text-sm leading-relaxed italic text-foreground">
              {request.decisionReason || "-"}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDuration(totalMinutes: number | null, t: (k: string, p?: any) => string) {
  if (!totalMinutes) return t("common.permanent");
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  const parts = [];
  if (d > 0) parts.push(t("requests.duration.days", { n: d }));
  if (h > 0) parts.push(t("requests.duration.hours", { n: h }));
  if (m > 0) parts.push(t("requests.duration.minutes", { n: m }));
  return parts.join(" ");
}

function StatusBadge({ status }: { status: AccessRequestStatus }) {
  const t = useT();
  const styles: Record<AccessRequestStatus, { color: string; icon: any }> = {
    pending: { color: "bg-amber-500/15 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/20", icon: Clock },
    approved: { color: "bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/20", icon: CheckCircle2 },
    denied: { color: "bg-rose-500/15 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30 dark:border-rose-500/20", icon: XCircle },
    expired: { color: "bg-muted/50 text-muted-foreground border-border", icon: AlertCircle },
    cancelled: { color: "bg-muted/50 text-muted-foreground border-border", icon: X },
  };

  const style = styles[status];
  const Icon = style.icon;

  return (
    <Badge variant="outline" className={cn("gap-1 px-1.5 h-5", style.color)}>
      <Icon className="size-3" />
      {t(`requests.status.${status}`)}
    </Badge>
  );
}

function DecisionDialog({
  open,
  onOpenChange,
  request,
  type,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: AccessRequest;
  type: "approved" | "denied";
  onSaved: () => void;
}) {
  const t = useT();
  const [role, setRole] = useState<string>(request.approvedRole || request.requestedRole);
  const [days, setDays] = useState<string>("");
  const [hours, setHours] = useState<string>("");
  const [minutes, setMinutes] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Pre-fill approved duration from request if it was a temporary request.
  useEffect(() => {
    if (request.durationMinutes) {
      setDays(Math.floor(request.durationMinutes / 1440).toString() || "");
      setHours(Math.floor((request.durationMinutes % 1440) / 60).toString() || "");
      setMinutes((request.durationMinutes % 60).toString() || "");
    }
  }, [request.durationMinutes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let totalMinutes: number | null = null;
    const d = parseInt(days || "0", 10);
    const h = parseInt(hours || "0", 10);
    const m = parseInt(minutes || "0", 10);
    if (d > 0 || h > 0 || m > 0) {
      totalMinutes = (d * 1440) + (h * 60) + m;
    }

    setBusy(true);
    try {
      await decideAccessRequest(request.id, {
        status: type,
        approvedRole: type === "approved" ? role : undefined,
        approvedDurationMinutes: type === "approved" ? totalMinutes : undefined,
        decisionReason: reason,
      });
      toast.success(t("requests.toast.decided"));
      onSaved();
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
      <DialogContent className="sm:max-w-[450px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {type === "approved" ? t("requests.action.approve") : t("requests.action.deny")}
            </DialogTitle>
            <DialogDescription>
              {t("requests.approver_desc", { name: request.targetName || request.targetId })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Requester's Info (Read-only) */}
            <div className="space-y-3 p-3 rounded-lg bg-surface-2 border border-line-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium uppercase tracking-wider">
                  {t("requests.modal.requested_role")}
                </span>
                <Badge variant="outline" className="h-5 capitalize">
                  {t(`role.${request.requestedRole}`)}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium uppercase tracking-wider">
                  {t("requests.modal.requested_duration")}
                </span>
                <span className="font-semibold text-foreground">
                  {formatDuration(request.durationMinutes, t)}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  {t("requests.col.reason")}
                </span>
                <p className="text-xs text-foreground leading-relaxed italic">
                  {request.reason || "-"}
                </p>
              </div>
            </div>

            <Separator className="bg-line-1" />

            {/* Approver's Decision (Editable) */}
            <div className="space-y-4">
              {type === "approved" && (
                <>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("requests.modal.approved_role")}
                    </Label>
                    <Select value={role} onValueChange={(v) => v && setRole(v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">{t("role.user")}</SelectItem>
                        <SelectItem value="editor">{t("role.editor")}</SelectItem>
                        <SelectItem value="manager">{t("role.manager")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("requests.modal.approved_duration")}
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="app-days" className="text-[10px] text-muted-foreground uppercase">{t("requests.modal.duration_days")}</Label>
                        <Input
                          id="app-days"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={days}
                          onChange={(e) => setDays(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="app-hours" className="text-[10px] text-muted-foreground uppercase">{t("requests.modal.duration_hours")}</Label>
                        <Input
                          id="app-hours"
                          type="number"
                          min="0"
                          max="23"
                          placeholder="0"
                          value={hours}
                          onChange={(e) => setHours(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="app-minutes" className="text-[10px] text-muted-foreground uppercase">{t("requests.modal.duration_minutes")}</Label>
                        <Input
                          id="app-minutes"
                          type="number"
                          min="0"
                          max="59"
                          placeholder="0"
                          value={minutes}
                          onChange={(e) => setMinutes(e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {type === "approved" ? t("requests.modal.approval_reason") : t("requests.modal.denial_reason")}
                </Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  placeholder={t("common.optional")}
                  className="min-h-[80px]"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              className={cn("px-6", type === "approved" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-500 hover:bg-rose-600 text-white")}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  {t("common.processing")}
                </>
              ) : (
                t("common.confirm")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
