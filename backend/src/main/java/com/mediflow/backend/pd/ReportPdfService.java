package com.mediflow.backend.pd;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.*;
import java.util.*;

@Service
public class ReportPdfService {
    private static final float MARGIN = 52;
    private static final float BODY_SIZE = 10.5f;
    private static final float LINE_HEIGHT = 16;

    public byte[] create(String report) {
        try (PDDocument document = new PDDocument();
             InputStream fontStream = new ClassPathResource("fonts/NotoSansKR-VF.ttf").getInputStream();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDFont font = PDType0Font.load(document, fontStream, true);
            PageWriter writer = new PageWriter(document, font);
            for (String rawLine : report.replace("\r", "").split("\n", -1)) {
                boolean heading = rawLine.startsWith("[") && rawLine.endsWith("]");
                float size = heading ? 13 : BODY_SIZE;
                if (rawLine.equals("파킨슨병 입원 결과보고서")) size = 18;
                List<String> lines = wrap(rawLine, font, size, PDRectangle.A4.getWidth() - MARGIN * 2);
                if (lines.isEmpty()) lines = List.of("");
                for (String line : lines) writer.line(line, size, heading || size == 18);
                if (heading || size == 18) writer.space(4);
            }
            writer.close();
            document.save(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("PDF 결과지를 만들지 못했습니다.", exception);
        }
    }

    private List<String> wrap(String text, PDFont font, float size, float maxWidth) throws IOException {
        if (text.isEmpty()) return new ArrayList<>();
        List<String> result = new ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (int offset = 0; offset < text.length();) {
            int codePoint = text.codePointAt(offset);
            String character = new String(Character.toChars(codePoint));
            String candidate = line + character;
            if (!line.isEmpty() && font.getStringWidth(candidate) / 1000 * size > maxWidth) {
                result.add(line.toString());
                line.setLength(0);
            }
            line.append(character);
            offset += Character.charCount(codePoint);
        }
        if (!line.isEmpty()) result.add(line.toString());
        return result;
    }

    private static final class PageWriter implements AutoCloseable {
        private final PDDocument document;
        private final PDFont font;
        private PDPage page;
        private PDPageContentStream stream;
        private float y;

        private PageWriter(PDDocument document, PDFont font) throws IOException {
            this.document = document;
            this.font = font;
            newPage();
        }

        private void line(String text, float size, boolean emphasized) throws IOException {
            if (y < MARGIN + LINE_HEIGHT) newPage();
            stream.beginText();
            stream.setFont(font, size);
            stream.setNonStrokingColor(new java.awt.Color(
                    emphasized ? 20 : 45, emphasized ? 91 : 60, emphasized ? 84 : 64));
            stream.newLineAtOffset(MARGIN, y);
            stream.showText(text);
            stream.endText();
            y -= Math.max(LINE_HEIGHT, size + 5);
        }

        private void space(float amount) { y -= amount; }

        private void newPage() throws IOException {
            if (stream != null) stream.close();
            page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            stream = new PDPageContentStream(document, page);
            y = page.getMediaBox().getHeight() - MARGIN;
        }

        @Override public void close() throws IOException { if (stream != null) stream.close(); }
    }
}
