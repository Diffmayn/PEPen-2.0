import pathlib
import json

import streamlit as st
import streamlit.components.v1 as components


def main() -> None:
    st.set_page_config(page_title="PEPen 2.0", layout="wide")

    html_path = pathlib.Path(__file__).with_name("streamlit_embedded_app.html")
    if not html_path.exists():
        st.error("Missing streamlit_embedded_app.html")
        st.info("Run: `npm run build` then `node scripts/generate_streamlit_embed.js`.")
        st.stop()

    html = html_path.read_text(encoding="utf-8")

    # Inject bundled demo XML so the app can load samples without fetching files.
    # This keeps the Streamlit single-file embed self-contained.
    try:
        base_dir = pathlib.Path(__file__).parent
        ipr_path = base_dir / "public" / "sample-xml" / "PMR_A0626052_IPR.xml"
        leaflet_path = base_dir / "public" / "sample-xml" / "PMR_A0626052_Leaflet.xml"
        if ipr_path.exists() and leaflet_path.exists():
            ipr_text = ipr_path.read_text(encoding="utf-8")
            leaflet_text = leaflet_path.read_text(encoding="utf-8")
            bundle = {
                "events": {
                    "A0626052": {"iprText": ipr_text, "leafletText": leaflet_text}
                }
            }
            safe_json = (
                json.dumps(bundle)
                .replace("</", "<\\/")
                .replace("\u2028", "\\u2028")
                .replace("\u2029", "\\u2029")
            )
            injection = f"<script>window.__PEPEN_BUNDLED_XML__ = {safe_json};</script>"
            if "<head>" in html:
                html = html.replace("<head>", "<head>" + injection, 1)
            else:
                html = injection + html
    except Exception:
        # Best effort; demo loading will fall back to fetch() when available.
        pass

    # Render React app in an iframe via Streamlit Components.
    components.html(html, height=900, scrolling=True)


if __name__ == "__main__":
    main()
