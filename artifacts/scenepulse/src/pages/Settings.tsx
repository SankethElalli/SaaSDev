import {
  useGetProfile,
  useUpdateProfile,
  useGetMyArtist,
  useUpdateArtist,
  getGetProfileQueryKey,
  getGetMyArtistQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2, LocateFixed, X } from "lucide-react";
import { uploadFile } from "@/lib/storage";
import { detectCity, getCurrentCoords } from "@/lib/geo";

const profileSchema = z.object({
  displayName: z.string().optional(),
  bio: z.string().optional(),
  city: z.string().optional(),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  avatarUrl: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const GENRE_SUGGESTIONS = [
  "Hip-Hop","R&B","Pop","Rock","Indie","Electronic","Jazz",
  "Soul","Folk","Metal","Classical","Reggae","Blues","Punk",
  "Lo-fi","Ambient","Trap","Drill","Afrobeats","Latin",
];

function GenreInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = (g: string) => { const t = g.trim(); if (t && !value.includes(t)) onChange([...value, t]); setInput(""); };
  const remove = (g: string) => onChange(value.filter((v) => v !== g));
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) { e.preventDefault(); add(input); }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.map((g) => (
          <span key={g} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">
            {g}<button type="button" onClick={() => remove(g)}><X className="h-2.5 w-2.5" /></button>
          </span>
        ))}
      </div>
      <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder="Type a genre and press Enter…" className="bg-background/50" />
      <div className="flex flex-wrap gap-1">
        {GENRE_SUGGESTIONS.filter((g) => !value.includes(g)).slice(0, 10).map((g) => (
          <button key={g} type="button" onClick={() => add(g)}
            className="px-2 py-0.5 rounded-full border border-white/10 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [detectingCity, setDetectingCity] = useState(false);

  const { data: profile, isLoading } = useGetProfile(user?.id ?? "", {
    query: {
      enabled: !!user?.id,
      queryKey: getGetProfileQueryKey(user?.id ?? ""),
    },
  });

  const updateProfile = useUpdateProfile();

  // Artist profile editing
  const isArtist = profile?.role === "artist";
  const { data: myArtist } = useGetMyArtist(user?.id ?? "", {
    query: { enabled: !!user?.id && isArtist, retry: false, retryOnMount: false },
  });
  const updateArtist = useUpdateArtist();

  // Artist form state
  const [artistName, setArtistName] = useState("");
  const [artistCity, setArtistCity] = useState("");
  const [artistBio, setArtistBio] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [artistWebsiteUrl, setArtistWebsiteUrl] = useState("");
  const [detectingArtistCity, setDetectingArtistCity] = useState(false);
  const artistInitialized = useRef(false);

  useEffect(() => {
    if (myArtist && !artistInitialized.current) {
      artistInitialized.current = true;
      setArtistName(myArtist.artistName ?? "");
      setArtistCity(myArtist.city ?? "");
      setArtistBio(myArtist.bio ?? "");
      setGenres(myArtist.genres ?? []);
      setSpotifyUrl(myArtist.spotifyUrl ?? "");
      setInstagramUrl(myArtist.instagramUrl ?? "");
      setYoutubeUrl(myArtist.youtubeUrl ?? "");
      setArtistWebsiteUrl(myArtist.websiteUrl ?? "");
    }
  }, [myArtist]);

  const handleDetectArtistCity = async () => {
    setDetectingArtistCity(true);
    try {
      const [cityResult] = await Promise.all([detectCity(), getCurrentCoords()]);
      if (cityResult) setArtistCity(cityResult);
      else toast({ title: "Could not detect location", description: "Allow location access and try again.", variant: "destructive" });
    } finally { setDetectingArtistCity(false); }
  };

  const saveArtistProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!myArtist?.id) return;
    updateArtist.mutate(
      { id: myArtist.id, data: {
        artistName: artistName.trim() || undefined,
        city: artistCity.trim() || undefined,
        bio: artistBio.trim() || undefined,
        genres,
        spotifyUrl: spotifyUrl.trim() || undefined,
        instagramUrl: instagramUrl.trim() || undefined,
        youtubeUrl: youtubeUrl.trim() || undefined,
        websiteUrl: artistWebsiteUrl.trim() || undefined,
      }},
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyArtistQueryKey(user!.id) });
          toast({ title: "Artist profile updated" });
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      },
    );
  };

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: "",
      bio: "",
      city: "",
      websiteUrl: "",
      avatarUrl: "",
    },
  });

  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (profile && initializedForId.current !== profile.id) {
      initializedForId.current = profile.id;
      form.reset({
        displayName: profile.displayName || "",
        bio: profile.bio || "",
        city: profile.city || "",
        websiteUrl: profile.websiteUrl || "",
        avatarUrl: profile.avatarUrl || "",
      });
    }
  }, [profile, form]);

  const onSubmit = (data: ProfileFormValues) => {
    if (!user?.id) return;
    updateProfile.mutate(
      { id: user.id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetProfileQueryKey(user.id),
          });
          toast({ title: "Profile updated" });
        },
        onError: () => {
          toast({
            title: "Failed to update profile",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAvatarUploading(true);
    try {
      const url = await uploadFile("Profile", file);
      form.setValue("avatarUrl", url, { shouldDirty: true });
      toast({ title: "Photo uploaded — save to apply" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleDetectCity = async () => {
    setDetectingCity(true);
    try {
      const city = await detectCity();
      if (city) {
        form.setValue("city", city, { shouldDirty: true });
      } else {
        toast({
          title: "Could not detect location",
          description: "Allow location access and try again.",
          variant: "destructive",
        });
      }
    } finally {
      setDetectingCity(false);
    }
  };

  const avatarUrl = form.watch("avatarUrl") || profile?.avatarUrl;

  if (isLoading)
    return (
      <div className="flex-1 flex items-center justify-center">
        Loading settings…
      </div>
    );

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-4xl font-bold mb-8">Settings</h1>

      <div className="glass p-8 rounded-3xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="flex items-center gap-6 mb-8">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-primary/20">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      className="w-full h-full object-cover"
                      alt="Avatar"
                    />
                  ) : (
                    <span className="text-3xl font-bold opacity-30">
                      {profile?.displayName?.charAt(0) ||
                        user?.email?.charAt(0)}
                    </span>
                  )}
                  {avatarUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  aria-label="Upload profile photo"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleAvatarFile(e)}
                />
              </div>
              <div>
                <p className="font-medium">
                  {profile?.displayName || user?.email}
                </p>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
                >
                  {avatarUploading ? "Uploading…" : "Change profile photo"}
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Your name"
                        className="bg-background/50"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g. San Francisco, CA"
                          className="bg-background/50"
                          {...field}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          disabled={detectingCity}
                          onClick={() => void handleDetectCity()}
                          title="Auto-detect my location"
                          className="shrink-0"
                        >
                          {detectingCity ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <LocateFixed className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="websiteUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://…"
                      className="bg-background/50"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us about yourself…"
                      className="resize-none min-h-[120px] bg-background/50"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-4 flex justify-end">
              <Button type="submit" size="lg" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </div>

      {/* Artist profile section — only for artists with an existing artist record */}
      {isArtist && myArtist && (
        <div className="glass p-8 rounded-3xl mt-6">
          <h2 className="text-xl font-semibold mb-1">Artist Profile</h2>
          <p className="text-sm text-muted-foreground mb-6">
            This is what appears on your public pin and profile page.
          </p>
          <form onSubmit={saveArtistProfile} className="space-y-5">

            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Artist / Band name</label>
                <Input value={artistName} onChange={(e) => setArtistName(e.target.value)}
                  placeholder="Stage name or band name" className="bg-background/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Based in</label>
                <div className="flex gap-2">
                  <Input value={artistCity} onChange={(e) => setArtistCity(e.target.value)}
                    placeholder="e.g. Bengaluru, India" className="bg-background/50" />
                  <Button type="button" size="icon" variant="outline" disabled={detectingArtistCity}
                    onClick={() => void handleDetectArtistCity()} title="Auto-detect location" className="shrink-0">
                    {detectingArtistCity ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Genres</label>
              <GenreInput value={genres} onChange={setGenres} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                <svg viewBox="0 0 24 24" className="inline h-3.5 w-3.5 mr-1 fill-[#1DB954]"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.5 17.3a.75.75 0 0 1-1.03.247c-2.82-1.722-6.37-2.11-10.55-1.157a.75.75 0 1 1-.334-1.462c4.575-1.043 8.504-.594 11.67 1.339a.75.75 0 0 1 .244 1.033zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.227-1.983-8.145-2.558-11.963-1.4a.938.938 0 0 1-.58-1.787c4.363-1.339 9.79-.69 13.52 1.587a.94.94 0 0 1 .313 1.29zm.127-3.403c-3.868-2.298-10.248-2.51-13.944-1.388a1.125 1.125 0 1 1-.653-2.154c4.243-1.287 11.296-1.038 15.753 1.605a1.125 1.125 0 0 1-1.156 1.937z"/></svg>
                Spotify Artist URL
              </label>
              <Input value={spotifyUrl} onChange={(e) => setSpotifyUrl(e.target.value)}
                placeholder="https://open.spotify.com/artist/…" className="bg-background/50" />
              <p className="text-[11px] text-muted-foreground">Paste from your Spotify profile → Share → Copy link.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Bio</label>
              <Textarea value={artistBio} onChange={(e) => setArtistBio(e.target.value)}
                placeholder="Tell fans and venues about your sound…"
                className="resize-none min-h-[100px] bg-background/50" />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {([
                { label: "Instagram", value: instagramUrl, set: setInstagramUrl, placeholder: "https://instagram.com/…" },
                { label: "YouTube",   value: youtubeUrl,   set: setYoutubeUrl,   placeholder: "https://youtube.com/…" },
                { label: "Website",   value: artistWebsiteUrl, set: setArtistWebsiteUrl, placeholder: "https://yoursite.com" },
              ] as { label: string; value: string; set: (v: string) => void; placeholder: string }[]).map(({ label, value, set, placeholder }) => (
                <div key={label} className="space-y-1.5">
                  <label className="text-sm font-medium">{label}</label>
                  <div className="flex gap-1.5">
                    <Input value={value} onChange={(e) => set(e.target.value)}
                      placeholder={placeholder} className="bg-background/50 text-sm" />
                    {value && (
                      <Button type="button" size="icon" variant="ghost" onClick={() => set("")} className="shrink-0 h-9 w-9">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" size="lg" disabled={updateArtist.isPending}>
                {updateArtist.isPending ? "Saving…" : "Save Artist Profile"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {isArtist && !myArtist && (
        <div className="glass p-6 rounded-3xl mt-6 text-center text-sm text-muted-foreground">
          Complete your artist profile from the <a href="/dashboard" className="text-primary underline">Dashboard</a> first, then you can edit it here.
        </div>
      )}
    </div>
  );
}
