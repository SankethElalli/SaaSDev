import {
  useGetMyArtist,
  useGetArtistProfile,
  useAddArtistMedia,
  useDeleteArtistMedia,
  useUpdateArtist,
  getGetMyArtistQueryKey,
  getGetArtistProfileQueryKey,
} from "@workspace/api-client-react";
import type { Profile } from "@workspace/api-client-react";
import { isNotFound } from "@/lib/api-error";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Image, Users, ExternalLink, Check, X, Tag, Link2 } from "lucide-react";
import { CreateArtistForm } from "./CreateArtistForm";
import { MediaManager } from "./MediaManager";
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

  const { data: profile } = useGetArtistProfile(artistId, {
    query: { queryKey: getGetArtistProfileQueryKey(artistId) },
  });
  const media = profile?.media ?? [];
  const artist = profile?.artist;

  const addMedia = useAddArtistMedia();
  const deleteMedia = useDeleteArtistMedia();
  const updateArtist = useUpdateArtist();

  const invalidateMedia = () =>
    qc.invalidateQueries({ queryKey: getGetArtistProfileQueryKey(artistId) });

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
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/artists/${artistId}`}>
              <ExternalLink className="w-4 h-4 mr-2" /> View public page
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/artists/${artistId}?tab=collab`}>
              <Users className="w-4 h-4 mr-2" /> Collab profile
            </Link>
          </Button>
        </div>
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

    </div>
  );
}
