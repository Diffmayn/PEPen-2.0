import pathlib
import json
import os

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

    # Inject a small config value for demo XML loading.
    # Avoid embedding large XML blobs in srcdoc (can hit browser/Streamlit limits and break JS parsing).
    try:
        sample_base_url = os.environ.get(
            "PEPEN_SAMPLE_BASE_URL",
            "https://raw.githubusercontent.com/Diffmayn/PEPen-2.0/main/public/sample-xml",
        )
        safe_url = json.dumps(str(sample_base_url)).replace("</", "<\\/")
        injection = f"<script>window.__PEPEN_SAMPLE_BASE_URL__ = {safe_url};</script>"
        if "<head>" in html:
            html = html.replace("<head>", "<head>" + injection, 1)
        else:
            html = injection + html
    except Exception:
        pass

    # Render React app in an iframe via Streamlit Components.
    components.html(html, height=900, scrolling=True)


if __name__ == "__main__":
    main()
