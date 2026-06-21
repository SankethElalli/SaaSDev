import {
  useGetMyArtist,
  useGetArtistProfile,
  useAddArtistMedia,
  useDeleteArtistMedia,
  useListArtistCollaborations,
  useUpdateCollaborationRequest,
  useUpdateArtist,
  getGetMyArtistQueryKey,
  getGetArtistProfileQueryKey,
  getListArtistCollaborationsQueryKey,
} from "@workspace/api-client-react";
import type { Profile } from "@workspace/api-client-react";
import { isNotFound } from "@/lib/api-error";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Image, Users, ExternalLink, Check, X, Tag, Link2, Music2, Scissors } from "lucide-react";
import { CreateArtistForm } from "./CreateArtistForm";
import { MediaManager } from "./MediaManager";
import { TrackManager, type ArtistTrack } from "./TrackManager";
import { StemRequestsPanel } from "./StemRequestsPanel";
import { useAuth } from "@/contexts/auth";
import { useState, useCallback, useEffect, useRef } from "react";

export function ArtistDashboard({ profile }: { profile: Profile }) {
  const {
    data: artist,
    isLoading,
    error,
  } = useGetMyArtist(profile.id, {
    query: { retry: false, queryKey: getGetMyArtistQueryKey(profile.id) },
  });

  if (isLoading)
    return <p className="text-muted-foreground">Loading your dashboard…</p>;

  if (error) {
    if (isNotFound(error)) {
      return (
        <CreateArtistForm profileId={profile.id} defaultCity={profile.city} />
      );
    }
    return (
      <p className="text-destructive">Could not load your artist dashboard.</p>
    );
  }

  if (!artist) return null;

  return <ArtistHub profileId={profile.id} artistId={artist.id} artistName={artist.artistName} />;
}

function TagInput({
  label,
  tags,
  onSave,
  saving,
}: {
  label: string;
  tags: string[];
  onSave: (tags: string[]) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(tags.join(", "));
  const [dirty, setDirty] = useState(false);

  const handleChange = (v: string) => {
    setDraft(v);
    setDirty(true);
  };

  const handleSave = () => {
    const parsed = draft
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    onSave(parsed);
    setDirty(false);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={`e.g. jazz, indie, folk`}
          className="flex-1"
        />
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          <Check className="w-4 h-4 mr-1" />
          Save
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tags.map((t) => (
            <span
              key={t}
              className="px-2.5 py-0.5 rounded-full bg-muted text-sm capitalize"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Separate multiple tags with commas
      </p>
    </div>
  );
}

const LINK_FIELDS = [
  { name: "spotifyUrl",   label: "Spotify",   placeholder: "https://open.spotify.com/artist/…" },
  { name: "instagramUrl", label: "Instagram", placeholder: "https://instagram.com/…" },
  { name: "youtubeUrl",   label: "YouTube",   placeholder: "https://youtube.com/…" },
  { name: "websiteUrl",   label: "Website",   placeholder: "https://…" },
] as const;

type LinkField = typeof LINK_FIELDS[number]["name"];

function ArtistLinksSection({
  artistId,
  artist,
  updateArtist,
}: {
  artistId: string;
  artist: { spotifyUrl?: string | null; instagramUrl?: string | null; youtubeUrl?: string | null; websiteUrl?: string | null } | undefined;
  updateArtist: ReturnType<typeof useUpdateArtist>;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [links, setLinks] = useState<Record<LinkField, string>>({
    spotifyUrl: "", instagramUrl: "", youtubeUrl: "", websiteUrl: "",
  });
  const initialized = useRef(false);

  useEffect(() => {
    if (artist && !initialized.current) {
      initialized.current = true;
      setLinks({
        spotifyUrl:   artist.spotifyUrl   ?? "",
        instagramUrl: artist.instagramUrl ?? "",
        youtubeUrl:   artist.youtubeUrl   ?? "",
        websiteUrl:   artist.websiteUrl   ?? "",
      });
    }
  }, [artist]);

  const handleSave = () => {
    updateArtist.mutate(
      {
        id: artistId,
        data: {
          spotifyUrl:   links.spotifyUrl   || undefined,
          instagramUrl: links.instagramUrl || undefined,
          youtubeUrl:   links.youtubeUrl   || undefined,
          websiteUrl:   links.websiteUrl   || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Links saved" });
          void qc.invalidateQueries({ queryKey: getGetArtistProfileQueryKey(artistId) });
        },
        onError: () => toast({ title: "Could not save links", variant: "destructive" }),
      },
    );
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Link2 className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-semibold">Links</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Add your streaming and social links. Clear a field and save to remove it.
      </p>
      <div className="glass-card rounded-2xl p-6 space-y-4">
        {LINK_FIELDS.map(({ name, label, placeholder }) => (
          <div key={name} className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </label>
            <div className="flex gap-2">
              <Input
                value={links[name]}
                onChange={(e) => setLinks((prev) => ({ ...prev, [name]: e.target.value }))}
                placeholder={placeholder}
                className="flex-1"
              />
              {links[name] && (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setLinks((prev) => ({ ...prev, [name]: "" }))}
                  title={`Remove ${label} URL`}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
        <div className="pt-2 flex justify-end">
          <Button onClick={handleSave} disabled={updateArtist.isPending}>
            {updateArtist.isPending ? "Saving…" : "Save Links"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ArtistHub({
  profileId,
  artistId,
  artistName,
}: {
  profileId: string;
  artistId: string;
  artistName: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { session } = useAuth();

  const { data: profile } = useGetArtistProfile(artistId, {
    query: { queryKey: getGetArtistProfileQueryKey(artistId) },
  });
  const media = profile?.media ?? [];
  const artist = profile?.artist;

  const addMedia = useAddArtistMedia();
  const deleteMedia = useDeleteArtistMedia();
  const updateArtist = useUpdateArtist();

  // Tracks
  const [tracks, setTracks] = useState<ArtistTrack[]>([]);
  const [trackAdding, setTrackAdding] = useState(false);
  const [trackDeletingId, setTrackDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/artists/${artistId}/tracks`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: ArtistTrack[]) => setTracks(data))
      .catch(() => {});
  }, [artistId]);

  const handleAddTrack = async (input: { title: string; url: string }) => {
    const token = session?.access_token;
    if (!token) return;
    setTrackAdding(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed");
      }
      const created = await res.json() as ArtistTrack;
      setTracks((prev) => [...prev, created]);
      toast({ title: "Track added" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not add track", variant: "destructive" });
    } finally {
      setTrackAdding(false);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    const token = session?.access_token;
    if (!token) return;
    setTrackDeletingId(trackId);
    try {
      await fetch(`/api/artists/${artistId}/tracks/${trackId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
      toast({ title: "Track deleted" });
    } catch {
      toast({ title: "Could not delete track", variant: "destructive" });
    } finally {
      setTrackDeletingId(null);
    }
  };

  const { data: collaborations } = useListArtistCollaborations(artistId);
  const updateCollab = useUpdateCollaborationRequest();

  const invalidateMedia = () =>
    qc.invalidateQueries({ queryKey: getGetArtistProfileQueryKey(artistId) });
  const invalidateCollabs = () =>
    qc.invalidateQueries({
      queryKey: getListArtistCollaborationsQueryKey(artistId),
    });

  const handleTagSave = useCallback(
    (field: "genres" | "moodTags" | "themes", tags: string[]) => {
      updateArtist.mutate(
        { id: artistId, data: { [field]: tags } },
        {
          onSuccess: () => {
            toast({ title: "Tags saved" });
            void qc.invalidateQueries({ queryKey: getGetArtistProfileQueryKey(artistId) });
          },
          onError: () =>
            toast({ title: "Could not save tags", variant: "destructive" }),
        },
      );
    },
    [artistId, updateArtist, toast, qc],
  );

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold mb-1">{artistName}</h1>
          <p className="text-muted-foreground">
            Your artist hub — manage media, tags and collaborations.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/artists/${artistId}`}>
            <ExternalLink className="w-4 h-4 mr-2" /> View public page
          </Link>
        </Button>
      </header>

      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">Genres, Moods &amp; Themes</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          These tags appear on your public profile and help fans discover you.
        </p>
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <TagInput
            label="Genres"
            tags={artist?.genres ?? []}
            saving={updateArtist.isPending}
            onSave={(tags) => handleTagSave("genres", tags)}
          />
          <TagInput
            label="Moods"
            tags={artist?.moodTags ?? []}
            saving={updateArtist.isPending}
            onSave={(tags) => handleTagSave("moodTags", tags)}
          />
          <TagInput
            label="Themes"
            tags={artist?.themes ?? []}
            saving={updateArtist.isPending}
            onSave={(tags) => handleTagSave("themes", tags)}
          />
        </div>
      </section>

      <ArtistLinksSection artistId={artistId} artist={artist} updateArtist={updateArtist} />

      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <Image className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">
            Photos &amp; videos
          </h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          These appear in the gallery on your public profile.
        </p>
        <MediaManager
          items={media}
          adding={addMedia.isPending}
          deletingId={deleteMedia.isPending ? deleteMedia.variables?.mediaId : null}
          onAdd={(input) =>
            addMedia.mutate(
              { id: artistId, data: input },
              {
                onSuccess: () => {
                  toast({ title: "Media added" });
                  void invalidateMedia();
                },
                onError: () =>
                  toast({
                    title: "Could not add media",
                    variant: "destructive",
                  }),
              },
            )
          }
          onDelete={(mediaId) =>
            deleteMedia.mutate(
              { id: artistId, mediaId },
              {
                onSuccess: () => void invalidateMedia(),
                onError: () =>
                  toast({
                    title: "Could not delete media",
                    variant: "destructive",
                  }),
              },
            )
          }
        />
      </section>

      {/* My Tracks */}
      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <Music2 className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">My Tracks</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Upload up to 3 tracks. Other artists can listen and request stems for their productions.
        </p>
        <TrackManager
          tracks={tracks}
          adding={trackAdding}
          deletingId={trackDeletingId}
          onAdd={handleAddTrack}
          onDelete={handleDeleteTrack}
        />
      </section>

      {/* Stem Requests */}
      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <Scissors className="w-5 h-5 text-secondary" />
          <h2 className="text-2xl font-semibold">Stem Requests</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Approve requests from other artists to receive AI-separated stems of your tracks.
        </p>
        <StemRequestsPanel artistId={artistId} />
      </section>

      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-secondary" />
          <h2 className="text-2xl font-semibold">Collaborations</h2>
        </div>
        {collaborations && collaborations.length > 0 ? (
          <div className="space-y-3">
            {collaborations.map((c) => {
              const incoming = c.toArtistId === artistId;
              const other = incoming ? c.fromArtistName : c.toArtistName;
              return (
                <div
                  key={c.id}
                  className="glass-card p-4 rounded-xl flex flex-wrap items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">
                      {incoming ? "Request from" : "Request to"}{" "}
                      <span className="text-primary">
                        {other ?? "Unknown artist"}
                      </span>
                    </p>
                    {c.message && (
                      <p className="text-sm text-muted-foreground truncate">
                        {c.message}
                      </p>
                    )}
                  </div>
                  {incoming && c.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          updateCollab.mutate(
                            { id: c.id, data: { status: "accepted" } },
                            { onSuccess: () => void invalidateCollabs() },
                          )
                        }
                        data-testid={`button-accept-collab-${c.id}`}
                      >
                        <Check className="w-4 h-4 mr-1" /> Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateCollab.mutate(
                            { id: c.id, data: { status: "declined" } },
                            { onSuccess: () => void invalidateCollabs() },
                          )
                        }
                        data-testid={`button-decline-collab-${c.id}`}
                      >
                        <X className="w-4 h-4 mr-1" /> Decline
                      </Button>
                    </div>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-muted capitalize">
                      {c.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No collaboration requests yet. Visit another artist's page to request
            one.
          </p>
        )}
      </section>
    </div>
  );
}
