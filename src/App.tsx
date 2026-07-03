import { Route, Routes } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { TOOLS } from "@/lib/tools";
import { CompressPdf } from "@/routes/CompressPdf";
import { EditAnnotatePdf } from "@/routes/EditAnnotatePdf";
import { FillForms } from "@/routes/FillForms";
import { Home } from "@/routes/Home";
import { ImagesToPdf } from "@/routes/ImagesToPdf";
import { MergePdf } from "@/routes/MergePdf";
import { Ocr } from "@/routes/Ocr";
import { OrganizePages } from "@/routes/OrganizePages";
import { PageNumbers } from "@/routes/PageNumbers";
import { PdfToImages } from "@/routes/PdfToImages";
import { ProtectUnlock } from "@/routes/ProtectUnlock";
import { RotatePdf } from "@/routes/RotatePdf";
import { SignPdf } from "@/routes/SignPdf";
import { SplitPdf } from "@/routes/SplitPdf";
import { ToolPlaceholder } from "@/routes/ToolPlaceholder";
import { Watermark } from "@/routes/Watermark";

export function App(): JSX.Element {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/unir" element={<MergePdf />} />
        <Route path="/dividir" element={<SplitPdf />} />
        <Route path="/rotar" element={<RotatePdf />} />
        <Route path="/organizar" element={<OrganizePages />} />
        <Route path="/pdf-a-imagenes" element={<PdfToImages />} />
        <Route path="/imagenes-a-pdf" element={<ImagesToPdf />} />
        <Route path="/numeros-pagina" element={<PageNumbers />} />
        <Route path="/marca-agua" element={<Watermark />} />
        <Route path="/comprimir" element={<CompressPdf />} />
        <Route path="/proteger" element={<ProtectUnlock />} />
        <Route path="/anotar" element={<EditAnnotatePdf />} />
        <Route path="/firmar" element={<SignPdf />} />
        <Route path="/rellenar-formularios" element={<FillForms />} />
        <Route path="/reconocer-texto" element={<Ocr />} />
        {TOOLS.filter(
          (tool) =>
            tool.path !== "/unir" &&
            tool.path !== "/dividir" &&
            tool.path !== "/rotar" &&
            tool.path !== "/organizar" &&
            tool.path !== "/pdf-a-imagenes" &&
            tool.path !== "/imagenes-a-pdf" &&
            tool.path !== "/numeros-pagina" &&
            tool.path !== "/marca-agua" &&
            tool.path !== "/comprimir" &&
            tool.path !== "/proteger" &&
            tool.path !== "/anotar" &&
            tool.path !== "/firmar" &&
            tool.path !== "/rellenar-formularios" &&
            tool.path !== "/reconocer-texto",
        ).map((tool) => (
          <Route
            key={tool.id}
            path={tool.path}
            element={<ToolPlaceholder title={tool.title} />}
          />
        ))}
      </Routes>
    </Layout>
  );
}
