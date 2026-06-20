import {
  useGetArtistProfile,
  getGetArtistProfileQueryKey,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { ArtistActions } from "@/components/artist/ArtistActions";
import { SongstatsPanel } from "@/components/artist/SongstatsPanel";
import {
  CheckCircle2,
  MapPin,
  Instagram,
  Youtube,
  Globe,
  Music2,
  Link2,
  Play,
} from "lucide-react";

const LINK_ICONS: Record<string, typeof Globe> = {
  spotify: Music2,
  instagram: Instagram,
  youtube: Youtube,
  website: Globe,
};

export default function ArtistDetail() {
  const params = useParams();
  const id = params.id as string;

  const {
    data: profile,
    isLoading,
    error,
  } = useGetArtistProfile(id, {
    query: { enabled: !!id, queryKey: getGetArtistProfileQueryKey(id) },
  });

  if (isLoading)
    return (
      <div className="flex-1 flex items-center justify-center">
        Loading artist...
      </div>
    );
  if (error || !profile)
    return (
      <div className="flex-1 flex items-center justify-center text-destructive">
        Error loading artist
      </div>
    );

  const { artist, links, media, recentEvents } = profile;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="glass-card rounded-3xl overflow-hidden mb-8">
        <div className="h-48 md:h-64 bg-muted relative w-full">
          {artist.imageUrl ? (
            <img
              src={artist.imageUrl}
              alt={artist.artistName}
              className="w-full h-full object-cover opacity-60"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-primary/20 to-secondary/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="px-6 md:px-12 pb-12 relative -mt-20">
          <div className="flex flex-col md:flex-row gap-6 md:items-end mb-6">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-background overflow-hidden bg-muted flex-shrink-0 z-10">
              {artist.imageUrl ? (
                <img
                  src={artist.imageUrl}
                  alt={artist.artistName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/20 text-primary text-4xl font-bold">
                  {artist.artistName.charAt(0)}
                </div>
              )}
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-4xl md:text-5xl font-bold">
                  {artist.artistName}
                </h1>
                {artist.verified && (
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                )}
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
            <div className="mb-8 p-5 rounded-2xl bg-primary/5 border border-primary/10">
              <p className="leading-relaxed">{artist.summary}</p>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-12">
            <div className="md:col-span-2 space-y-8">
              <section>
                <h2 className="text-2xl font-semibold mb-4">About</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {artist.bio || "No biography available."}
                </p>
              </section>
            </div>

            <div className="space-y-8">
              {artist.genres && artist.genres.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Genres
                  </h3>
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
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Moods
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {artist.moodTags.map((m) => (
                      <span
                        key={m}
                        className="px-3 py-1 rounded-full bg-secondary/10 text-secondary text-sm font-medium capitalize"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {artist.themes && artist.themes.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Themes
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {artist.themes.map((t) => (
                      <span
                        key={t}
                        className="px-3 py-1 rounded-full bg-muted text-sm font-medium capitalize"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <SongstatsPanel spotifyUrl={artist.spotifyUrl} />

              {links.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Links
                  </h3>
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
      </div>

      {media.length > 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {media.map((m) => (
              <div
                key={m.id}
                className="glass-card rounded-xl overflow-hidden group"
              >
                <div className="aspect-square bg-muted relative">
                  {m.type === "video" ? (
                    m.thumbnailUrl ? (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-full h-full"
                        data-testid="media-video"
                      >
                        <img
                          src={m.thumbnailUrl}
                          alt={m.caption ?? "Artist video"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex items-center justify-center w-12 h-12 rounded-full bg-black/60 backdrop-blur">
                            <Play className="w-5 h-5 text-white fill-white translate-x-0.5" />
                          </span>
                        </span>
                      </a>
                    ) : (
                      <video
                        src={m.url}
                        controls
                        className="w-full h-full object-cover"
                        data-testid="media-video"
                      />
                    )
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
                          el.textContent = "Image unavailable";
                          parent.appendChild(el);
                        }
                      }}
                    />
                  )}
                </div>
                {m.caption && (
                  <div className="p-2 text-xs text-muted-foreground truncate">
                    {m.caption}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-6">
        <h2 className="text-3xl font-bold">Recent & Upcoming Events</h2>
        {recentEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentEvents.map((event) => (
              <Link key={event.id} href={`/events/${event.id}`}>
                <div className="glass p-4 rounded-xl flex items-center gap-4 hover-elevate transition-all">
                  <div className="w-16 h-16 rounded-lg bg-secondary/20 flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {event.imageUrl ? (
                      <img
                        src={event.imageUrl}
                        className="w-full h-full rounded-lg object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate text-lg">
                      {event.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {new Date(event.eventDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div
                    className={`px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                      event.status === "upcoming"
                        ? "bg-primary/20 text-primary"
                        : "bg-muted"
                    }`}
                  >
                    {event.status}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="glass p-8 text-center rounded-xl text-muted-foreground">
            No events found for this artist.
          </div>
        )}
      </div>
    </div>
  );
}
