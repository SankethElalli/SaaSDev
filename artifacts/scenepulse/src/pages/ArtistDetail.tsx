import { useState, useEffect, useRef } from "react";
import {
  useGetArtistProfile,
  getGetArtistProfileQueryKey,
  useGetProfile,
  getGetProfileQueryKey,
  useGetMyArtist,
  getGetMyArtistQueryKey,
  useCreateCollaborationRequest,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { ArtistActions } from "@/components/artist/ArtistActions";
import { SongstatsPanel } from "@/components/artist/SongstatsPanel";
import { PublicTrackCard, type ArtistTrack } from "@/components/dashboard/TrackManager";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  MapPin,
  Instagram,
  Youtube,
  Globe,
  Music2,
  Link2,
  Play,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  Lock,
  Scissors,
} from "lucide-react";

const LINK_ICONS: Record<string, typeof Globe> = {
  spotify: Music2,
  instagram: Instagram,
  youtube: Youtube,
  website: Globe,
};

type LightboxItem = { url: string; type: "image" | "video"; caption?: string | null };

function Lightbox({
  items,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const item = items[index];
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose, onPrev, onNext]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close */}
      <button
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>

      {/* Prev */}
      {items.length > 1 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Next */}
      {items.length > 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Media */}
      <div
        className="relative max-w-5xl max-h-[90vh] w-full mx-4 flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {item.type === "video" ? (
          <video
            ref={videoRef}
            src={item.url}
            controls
            autoPlay
            className="max-h-[80vh] max-w-full rounded-xl shadow-2xl"
          />
        ) : (
          <img
            src={item.url}
            alt={item.caption ?? ""}
            className="max-h-[80vh] max-w-full object-contain rounded-xl shadow-2xl"
          />
        )}
        {item.caption && (
          <p className="text-white/70 text-sm text-center px-4">{item.caption}</p>
        )}
        {items.length > 1 && (
          <p className="text-white/40 text-xs">{index + 1} / {items.length}</p>
        )}
      </div>
    </div>
  );
}

function CollabTab({ artistId, artistName }: { artistId: string; artistName: string }) {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: profile } = useGetProfile(user?.id ?? "", {
    query: { enabled: !!user?.id, queryKey: getGetProfileQueryKey(user?.id ?? "") },
  });

  const { data: myArtist } = useGetMyArtist(profile?.id ?? "", {
    query: {
      enabled: profile?.role === "artist" && !!profile?.id,
      retry: false,
      queryKey: getGetMyArtistQueryKey(profile?.id ?? ""),
    },
  });

  const createCollab = useCreateCollaborationRequest();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  // Tracks
  const [tracks, setTracks] = useState<ArtistTrack[]>([]);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/artists/${artistId}/tracks`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: ArtistTrack[]) => setTracks(data))
      .catch(() => {});
  }, [artistId]);

  const canCollab = profile?.role === "artist" && myArtist && myArtist.id !== artistId;
  const isOwnProfile = myArtist?.id === artistId;

  const submit = () => {
    if (!myArtist) return;
    createCollab.mutate(
      { data: { fromArtistId: myArtist.id, toArtistId: artistId, message: message.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Collaboration request sent!" });
          setMessage("");
          setSent(true);
          void qc.invalidateQueries();
        },
        onError: () => toast({ title: "Could not send request", variant: "destructive" }),
      },
    );
  };

  const handleRequestStem = async (trackId: string, stemType: string) => {
    if (!myArtist || !session?.access_token) return;
    setRequestingId(trackId);
    try {
      const res = await fetch(`/api/tracks/${trackId}/stem-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ requesterArtistId: myArtist.id, stemType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to send request");
      }
      setRequestedIds((prev) => new Set([...prev, trackId]));
      toast({ title: "Stem request sent!", description: `${artistName} will be notified.` });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not send stem request", variant: "destructive" });
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <div className="space-y-6 py-6">
      {/* Tracks section */}
      {tracks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-secondary" />
            <h3 className="text-lg font-semibold">{artistName}'s Tracks</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Listen to {artistName}'s tracks. As an artist, you can request AI stem separation to use individual layers in your own productions.
          </p>
          <div className="space-y-3">
            {tracks.map((track) => (
              <PublicTrackCard
                key={track.id}
                track={track}
                myArtistId={myArtist?.id ?? null}
                ownerArtistId={artistId}
                onRequestStem={handleRequestStem}
                requesting={requestingId === track.id}
                requested={requestedIds.has(track.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-secondary/15 flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6 text-secondary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-1">Collaborate with {artistName}</h2>
            <p className="text-muted-foreground text-sm">
              Send a collaboration request to explore working together on tracks, events, or projects.
            </p>
          </div>
        </div>

        {isOwnProfile ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 text-sm text-muted-foreground">
            <UserCheck className="w-5 h-5 flex-shrink-0" />
            This is your own artist profile. Collaboration requests are sent to other artists.
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <Lock className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">Sign in to send a collaboration request.</p>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        ) : profile?.role !== "artist" ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 text-sm text-muted-foreground">
            <Users className="w-5 h-5 flex-shrink-0" />
            Collaboration requests are between artists. Set up an artist profile to request one.
          </div>
        ) : !myArtist ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 text-sm text-muted-foreground">
            <Users className="w-5 h-5 flex-shrink-0" />
            Complete your artist profile from the{" "}
            <Link href="/dashboard" className="text-primary underline">Dashboard</Link>{" "}
            first.
          </div>
        ) : sent ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20 text-sm">
            <UserCheck className="w-5 h-5 text-primary flex-shrink-0" />
            <span>Request sent! {artistName} will be notified.</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Tell ${artistName} what you have in mind — genre, project type, timeline…`}
                rows={4}
                className="bg-background/50 resize-none"
              />
            </div>
            <Button
              onClick={submit}
              disabled={createCollab.isPending || !canCollab}
              className="w-full sm:w-auto"
            >
              <Users className="w-4 h-4 mr-2" />
              {createCollab.isPending ? "Sending…" : "Send Collaboration Request"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ArtistDetail() {
  const params = useParams();
  const id = params.id as string;

  const [tab, setTab] = useState<"profile" | "collab">("profile");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const {
    data: profile,
    isLoading,
    error,
  } = useGetArtistProfile(id, {
    query: { enabled: !!id, queryKey: getGetArtistProfileQueryKey(id) },
  });

  if (isLoading)
    return (
      <div className="flex-1 flex items-center justify-center">Loading artist...</div>
    );
  if (error || !profile)
    return (
      <div className="flex-1 flex items-center justify-center text-destructive">
        Error loading artist
      </div>
    );

  const { artist, links, media, recentEvents } = profile;

  const lightboxItems: LightboxItem[] = media.map((m) => ({
    url: m.url,
    type: m.type === "video" ? "video" : "image",
    caption: m.caption,
  }));

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => ((i ?? 0) - 1 + lightboxItems.length) % lightboxItems.length)}
          onNext={() => setLightboxIndex((i) => ((i ?? 0) + 1) % lightboxItems.length)}
        />
      )}

      {/* Header card */}
      <div className="glass-card rounded-3xl overflow-hidden mb-6">
        <div className="h-48 md:h-64 bg-muted relative w-full">
          {artist.imageUrl ? (
            <img src={artist.imageUrl} alt={artist.artistName} className="w-full h-full object-cover opacity-60" />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-primary/20 to-secondary/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="px-6 md:px-12 pb-8 relative -mt-20">
          <div className="flex flex-col md:flex-row gap-6 md:items-end mb-6">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-background overflow-hidden bg-muted flex-shrink-0 z-10">
              {artist.imageUrl ? (
                <img src={artist.imageUrl} alt={artist.artistName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/20 text-primary text-4xl font-bold">
                  {artist.artistName.charAt(0)}
                </div>
              )}
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-4xl md:text-5xl font-bold">{artist.artistName}</h1>
                {artist.verified && <CheckCircle2 className="w-6 h-6 text-primary" />}
              </div>
              {artist.city && (
                <div className="flex items-center text-muted-foreground">
                  <MapPin className="w-4 h-4 mr-1" /> {artist.city}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pb-2">
              <ArtistActions artistId={id} />
            </div>
          </div>

          {artist.summary && (
            <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10">
              <p className="leading-relaxed">{artist.summary}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 glass rounded-xl w-fit">
        <button
          id="profile-tab-btn"
          onClick={() => setTab("profile")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "profile"
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => setTab("collab")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            tab === "collab"
              ? "bg-secondary text-secondary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="w-4 h-4" /> Collaborate
        </button>
      </div>

      {/* Profile tab */}
      {tab === "profile" && (
        <div className="space-y-8">
          {/* Bio + sidebar */}
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              <section className="glass-card rounded-2xl p-6">
                <h2 className="text-xl font-semibold mb-3">About</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {artist.bio || "No biography available."}
                </p>
              </section>

              {/* Gallery */}
              {media.length > 0 && (
                <section>
                  <h2 className="text-xl font-semibold mb-4">Gallery</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {media.map((m, idx) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setLightboxIndex(idx)}
                        className="group relative aspect-square bg-muted rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {m.type === "video" ? (
                          <>
                            {m.thumbnailUrl ? (
                              <img
                                src={m.thumbnailUrl}
                                alt={m.caption ?? "Video"}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                            ) : (
                              <div className="w-full h-full bg-muted flex items-center justify-center">
                                <Play className="w-8 h-8 text-muted-foreground" />
                              </div>
                            )}
                            <span className="absolute inset-0 flex items-center justify-center">
                              <span className="w-12 h-12 rounded-full bg-black/60 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Play className="w-5 h-5 text-white fill-white translate-x-0.5" />
                              </span>
                            </span>
                          </>
                        ) : (
                          <img
                            src={m.thumbnailUrl ?? m.url}
                            alt={m.caption ?? "Artist media"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            data-testid="media-image"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                              const parent = e.currentTarget.parentElement;
                              if (parent && !parent.querySelector(".img-error")) {
                                const el = document.createElement("div");
                                el.className = "img-error w-full h-full flex items-center justify-center text-muted-foreground text-xs";
                                el.textContent = "Unavailable";
                                parent.appendChild(el);
                              }
                            }}
                          />
                        )}
                        {m.caption && (
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/50 text-white text-[10px] truncate opacity-0 group-hover:opacity-100 transition-opacity">
                            {m.caption}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Events */}
              <section>
                <h2 className="text-xl font-semibold mb-4">Recent &amp; Upcoming Events</h2>
                {recentEvents.length > 0 ? (
                  <div className="space-y-3">
                    {recentEvents.map((event) => (
                      <Link key={event.id} href={`/events/${event.id}`}>
                        <div className="glass p-4 rounded-xl flex items-center gap-4 hover-elevate transition-all">
                          <div className="w-14 h-14 rounded-lg bg-secondary/20 flex-shrink-0 flex items-center justify-center overflow-hidden">
                            {event.imageUrl ? (
                              <img src={event.imageUrl} className="w-full h-full rounded-lg object-cover" />
                            ) : null}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">{event.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {new Date(event.eventDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div className={`px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                            event.status === "upcoming" ? "bg-primary/20 text-primary" : "bg-muted"
                          }`}>
                            {event.status}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="glass p-6 text-center rounded-xl text-muted-foreground text-sm">
                    No events found for this artist.
                  </div>
                )}
              </section>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {artist.genres && artist.genres.length > 0 && (
                <section className="glass-card rounded-2xl p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Genres</h3>
                  <div className="flex flex-wrap gap-2">
                    {artist.genres.map((g) => (
                      <Link key={g} href={`/discover?genre=${encodeURIComponent(g)}`}>
                        <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium hover-elevate cursor-pointer inline-block">
                          {g}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {artist.moodTags && artist.moodTags.length > 0 && (
                <section className="glass-card rounded-2xl p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Moods</h3>
                  <div className="flex flex-wrap gap-2">
                    {artist.moodTags.map((m) => (
                      <span key={m} className="px-3 py-1 rounded-full bg-secondary/10 text-secondary text-sm font-medium capitalize">
                        {m}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {artist.themes && artist.themes.length > 0 && (
                <section className="glass-card rounded-2xl p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Themes</h3>
                  <div className="flex flex-wrap gap-2">
                    {artist.themes.map((t) => (
                      <span key={t} className="px-3 py-1 rounded-full bg-muted text-sm font-medium capitalize">
                        {t}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <SongstatsPanel spotifyUrl={artist.spotifyUrl} />

              {links.length > 0 && (
                <section className="glass-card rounded-2xl p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Links</h3>
                  <div className="space-y-2">
                    {links.map((l) => {
                      const Icon = LINK_ICONS[l.type] ?? Link2;
                      return (
                        <a
                          key={l.id}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-sm hover-elevate rounded-lg px-2 py-1.5 -mx-2"
                        >
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <span>{l.label ?? l.type}</span>
                        </a>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collaborate tab */}
      {tab === "collab" && (
        <CollabTab artistId={id} artistName={artist.artistName} />
      )}
    </div>
  );
}
