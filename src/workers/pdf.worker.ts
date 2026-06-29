import * as Comlink from "comlink";

import { createPdfWorkerApi } from "@/workers/pdfWorkerApi";

Comlink.expose(createPdfWorkerApi());
