import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profilesRouter from "./profiles";
import artistsRouter from "./artists";
import venuesRouter from "./venues";
import eventsRouter from "./events";
import discoveryRouter from "./discovery";
import webhooksRouter from "./webhooks";
import followsRouter from "./follows";
import collaborationsRouter from "./collaborations";
import cyaniteRouter from "./cyanite";
import musixmatchRouter from "./musixmatch";
import jambaseRouter from "./jambase";
import songstatsRouter from "./songstats";
import imagesRouter from "./images";
import spotifyRouter from "./spotify";
import radioRouter from "./radio";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profilesRouter);
router.use(artistsRouter);
router.use(venuesRouter);
router.use(eventsRouter);
router.use(discoveryRouter);
router.use(webhooksRouter);
router.use(followsRouter);
router.use(collaborationsRouter);
router.use(cyaniteRouter);
router.use(musixmatchRouter);
router.use(jambaseRouter);
router.use(songstatsRouter);
router.use(imagesRouter);
router.use(spotifyRouter);
router.use(radioRouter);

export default router;
