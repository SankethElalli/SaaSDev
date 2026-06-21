import { useState, useEffect } from "react";
import { Scissors, Check, X, Download, Loader2, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

interface StemRequest {
  id: string;
  trackId: string;
  trackTitle: string | null;
  trackUrl: string | null;
  requesterArtistId: string;
  ownerArtistId: string;
  status: string;
  stemType: string;
  message: string | null;
  createdAt: string;
}

interface Stem {
  id: string;
  stemRequestId: string;
  stemType: string;
  url: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: "Pending",    color: "text-amber-400" },
  approved:   { label: "Approved",  color: "text-blue-400" },
  processing: { label: "Processing", color: "text-blue-400" },
  declined:   { label: "Declined",  color: "text-destructive" },
  ready:      { label: "Ready",     color: "text-green-400" },
  failed:     { label: "Failed",    color: "text-destructive" },
};

function StemDownloads({ requestId }: { requestId: string }) {
  const { session } = useAuth();
  const [stems, setStems] = useState<Stem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = session?.access_token;
    fetch(`/api/stem-requests/${requestId}/stems`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.ok ? r.json() : [])
      .then((data: Stem[]) => setStems(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [requestId, session?.access_token]);

  if (loading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  if (stems.length === 0) return <span className="text-xs text-muted-foreground">No stems yet</span>;

  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {stems.map((stem) => (
        <a
          key={stem.id}
          href={stem.url}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
        >
          <Download className="h-3 w-3" />
          {stem.stemType === "vocal" ? "Vocals" : stem.stemType === "instrumental" ? "Instrumental" : stem.stemType}
        </a>
      ))}
    </div>
  );
}

interface Props {
  artistId: string;
}

export function StemRequestsPanel({ artistId }: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<StemRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const token = session?.access_token;

  const fetchRequests = () => {
    if (!token) return;
    fetch(`/api/artists/${artistId}/stem-requests`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : [])
      .then((data: StemRequest[]) => setRequests(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId, token]);

  const respond = async (id: string, status: "approved" | "declined") => {
    if (!token) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/stem-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({
        title: status === "approved" ? "Stem request approved — processing started" : "Request declined",
      });
      fetchRequests();
    } catch {
      toast({ title: "Could not update request", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const incoming = requests.filter((r) => r.ownerArtistId === artistId);
  const outgoing = requests.filter((r) => r.requesterArtistId === artistId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stem requests…
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 py-8 text-center">
        <Scissors className="h-7 w-7 text-white/20" />
        <p className="text-sm text-muted-foreground">No stem requests yet</p>
        <p className="text-xs text-muted-foreground/60">
          When other artists request stems from your tracks, they'll appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Incoming — requests others made for your tracks */}
      {incoming.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Incoming requests ({incoming.length})
          </p>
          {incoming.map((req) => {
            const statusInfo = STATUS_LABELS[req.status] ?? { label: req.status, color: "text-muted-foreground" };
            const isPending = req.status === "pending";
            const isReady = req.status === "ready";
            const busy = actionId === req.id;

            return (
              <div
                key={req.id}
                className="glass-card rounded-xl border border-white/10 p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Music2 className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm font-semibold truncate">
                        {req.trackTitle ?? "Track"}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 capitalize">
                        {req.stemType}
                      </span>
                      <span className={cn("text-xs font-medium", statusInfo.color)}>
                        · {statusInfo.label}
                      </span>
                    </div>
                    {req.message && (
                      <p className="text-xs text-muted-foreground mt-1 ml-6">{req.message}</p>
                    )}
                  </div>

                  {isPending && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs gap-1"
                        disabled={busy}
                        onClick={() => respond(req.id, "approved")}
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs gap-1"
                        disabled={busy}
                        onClick={() => respond(req.id, "declined")}
                      >
                        <X className="h-3 w-3" />
                        Decline
                      </Button>
                    </div>
                  )}
                </div>

                {isReady && <StemDownloads requestId={req.id} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Outgoing — requests you made for others' tracks */}
      {outgoing.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your requests ({outgoing.length})
          </p>
          {outgoing.map((req) => {
            const statusInfo = STATUS_LABELS[req.status] ?? { label: req.status, color: "text-muted-foreground" };
            const isReady = req.status === "ready";

            return (
              <div
                key={req.id}
                className="glass-card rounded-xl border border-white/10 p-4 space-y-2"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Music2 className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm font-semibold truncate">
                    {req.trackTitle ?? "Track"}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 capitalize">
                    {req.stemType}
                  </span>
                  <span className={cn("text-xs font-medium", statusInfo.color)}>
                    · {statusInfo.label}
                  </span>
                  {(req.status === "approved" || req.status === "processing") && (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                  )}
                </div>
                {isReady && <StemDownloads requestId={req.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
