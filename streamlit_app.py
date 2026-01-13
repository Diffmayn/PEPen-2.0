import pathlib

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

    # Render React app in an iframe via Streamlit Components.
    components.html(html, height=900, scrolling=True)


if __name__ == "__main__":
    main()
