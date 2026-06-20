import {
  useGetEvent,
  getGetEventQueryKey,
  useGetArtist,
  getGetArtistQueryKey,
  useGetVenue,
  getGetVenueQueryKey,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Ticket } from "lucide-react";

export default function EventDetail() {
  const params = useParams();
  const id = params.id as string;

  const {
    data: event,
    isLoading,
    error,
  } = useGetEvent(id, {
    query: { enabled: !!id, queryKey: getGetEventQueryKey(id) },
  });

  const artistId = event?.artistId;
  const venueId = event?.venueId;

  const { data: artist } = useGetArtist(artistId!, {
    query: { enabled: !!artistId, queryKey: getGetArtistQueryKey(artistId!) },
  });
  const { data: venue } = useGetVenue(venueId!, {
    query: { enabled: !!venueId, queryKey: getGetVenueQueryKey(venueId!) },
  });

  if (isLoading)
    return (
      <div className="flex-1 flex items-center justify-center">
        Loading event...
      </div>
    );
  if (error || !event)
    return (
      <div className="flex-1 flex items-center justify-center text-destructive">
        Error loading event
      </div>
    );

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8 max-w-5xl">
      <div className="glass-card rounded-3xl overflow-hidden mb-8 sm:mb-12">
        <div className="h-52 sm:h-64 md:h-96 bg-muted relative w-full">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt={event.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-accent/20 to-chart-3/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 md:p-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-6">
              <div className="flex-1 min-w-0">
                <div
                  className={`inline-block px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider mb-3 sm:mb-4
                    ${event.status === "upcoming" ? "bg-primary text-primary-foreground" : ""}
                    ${event.status === "live" ? "bg-chart-4 text-chart-4-foreground" : ""}
                    ${event.status === "past" ? "bg-muted text-muted-foreground" : ""}
                    ${event.status === "cancelled" ? "bg-destructive text-destructive-foreground" : ""}
                  `}
                >
                  {event.status}
                </div>
                <h1 className="text-2xl sm:text-4xl md:text-6xl font-bold mb-3 sm:mb-4 leading-tight">
                  {event.name}
                </h1>

                <div className="flex flex-wrap gap-3 sm:gap-6 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-primary" />
                    <span className="text-sm sm:text-base">
                      {new Date(event.eventDate).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {event.ticketUrl && event.status === "upcoming" && (
                <Button
                  size="lg"
                  className="w-full md:w-auto font-bold text-base sm:text-lg h-12 sm:h-14 px-6 sm:px-8 shrink-0"
                  asChild
                >
                  <a href={event.ticketUrl} target="_blank" rel="noreferrer">
                    <Ticket className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Get Tickets
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 sm:gap-12">
        <div className="md:col-span-2 space-y-6 sm:space-y-8">
          <section>
            <h2 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4">
              About this Event
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed whitespace-pre-line">
              {event.description || "No details provided for this event."}
            </p>
          </section>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {artist && (
            <section className="glass p-4 sm:p-6 rounded-2xl">
              <h3 className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 sm:mb-4">
                Lineup
              </h3>
              <Link href={`/artists/${artist.id}`}>
                <div className="flex items-center gap-3 sm:gap-4 group cursor-pointer">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-muted overflow-hidden flex-shrink-0">
                    {artist.imageUrl ? (
                      <img
                        src={artist.imageUrl}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold">
                        {artist.artistName.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-base sm:text-lg group-hover:text-primary transition-colors">
                      {artist.artistName}
                    </h4>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {artist.genres?.slice(0, 2).join(", ")}
                    </p>
                  </div>
                </div>
              </Link>
            </section>
          )}

          {venue && (
            <section className="glass p-4 sm:p-6 rounded-2xl">
              <h3 className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 sm:mb-4">
                Location
              </h3>
              <Link href={`/venues/${venue.id}`}>
                <div className="group cursor-pointer">
                  <h4 className="font-bold text-base sm:text-lg mb-1 group-hover:text-secondary transition-colors">
                    {venue.name}
                  </h4>
                  <p className="text-xs sm:text-sm text-muted-foreground flex items-start gap-1">
                    <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      {venue.address}
                      <br />
                      {venue.city}
                    </span>
                  </p>
                </div>
              </Link>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
