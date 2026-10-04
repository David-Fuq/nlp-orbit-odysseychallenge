import streamlit as st
import textwrap

# ------------------------------
# Sample data (edit as you like)
# ------------------------------

SAMPLE_MISSION_LOG = textwrap.dedent("""
    From your current position, cruise forward about two floor tiles
    until you're just past the first crater. Then pivot right a quarter
    turn to face the communications tower.
""").strip()

REFERENCE_COMMANDS = """MOVE 2
TURN 90
"""

NEW_MISSION_LOG = textwrap.dedent("""
    Drift ahead three floor tiles, then swing around to face the first
    crater you see on your right.
""").strip()

NEW_REFERENCE_COMMANDS = """MOVE 3
TURN 90
"""

# Simple number word → integer map for the demo
NUMBER_WORDS = {
    "one": 1,
    "1": 1,
    "two": 2,
    "2": 2,
    "three": 3,
    "3": 3,
    "four": 4,
    "4": 4,
}

ANGLE_PHRASES = {
    "quarter turn": 90,
    "half turn": 180,
    "full turn": 360,
}


# Helper Functions

def parse_synonyms(text):
    """Turn 'word1, word2, word3' into ['word1', 'word2', 'word3']."""
    return [w.strip().lower() for w in text.split(",") if w.strip()]


def simulate_path(commands_text):
    """
    Very simple 2D simulator:
    - Start at (0,0) facing 'north' (90°).
    - MOVE N  -> move forward N tiles in current heading.
    - TURN A  -> rotate by A degrees (positive = right/clockwise).
    """
    x, y = 0.0, 0.0
    heading = 90.0  # degrees: 0=East, 90=North, 180=West, 270=South

    import math
    lines = [line.strip() for line in commands_text.strip().splitlines() if line.strip()]
    for line in lines:
        parts = line.upper().split()
        if not parts:
            continue
        if parts[0] == "MOVE" and len(parts) >= 2:
            try:
                dist = float(parts[1])
            except ValueError:
                continue
            # move in direction of heading
            rad = math.radians(heading)
            x += dist * math.cos(rad)
            y += dist * math.sin(rad)
        elif parts[0] == "TURN" and len(parts) >= 2:
            try:
                angle = float(parts[1])
            except ValueError:
                continue
            heading -= angle  # right turn is negative in math, but we treat as clockwise
    return x, y, heading % 360, lines


def compare_paths(student_cmds, ref_cmds):
    xs, ys, hs, student_list = simulate_path(student_cmds)
    xr, yr, hr, ref_list = simulate_path(ref_cmds)

    import math
    distance = math.sqrt((xs - xr) ** 2 + (ys - yr) ** 2)
    same_num_commands = len(student_list) == len(ref_list)

    return {
        "student_pos": (xs, ys, hs),
        "ref_pos": (xr, yr, hr),
        "distance": distance,
        "same_num_commands": same_num_commands,
        "student_list": student_list,
        "ref_list": ref_list,
    }


# ------------------------------
# Streamlit App
# ------------------------------

st.set_page_config(
    page_title="Lunar NLP Mission Log Trainer",
    layout="wide",
)

st.title("Lunar NLP Mission Log Trainer")
st.markdown(
    "Teach your robot to **understand language from Mission Control**:\n"
    "- Break text into important pieces (tokenization & info extraction)\n"
    "- Turn sentences into robot commands (intent + parameters)\n"
    "- Build a tiny language → command dictionary\n"
    "- Test on a new mission log and compare with an LLM"
)

st.sidebar.header("Mission Steps")
step = st.sidebar.radio(
    "Choose a step",
    [
        "1️⃣ Read Mission Log",
        "2️⃣ Extract Key Phrases",
        "3️⃣ Translate to Commands",
        "4️⃣ Build Dictionary",
        "5️⃣ Decode New Log",
        "6️⃣ Compare with LLM",
    ]
)

if "student_commands_1" not in st.session_state:
    st.session_state.student_commands_1 = ""
if "move_synonyms" not in st.session_state:
    st.session_state.move_synonyms = "forward, advance, cruise, ahead"
if "turn_synonyms" not in st.session_state:
    st.session_state.turn_synonyms = "turn, pivot, rotate, swing"
if "left_synonyms" not in st.session_state:
    st.session_state.left_synonyms = "left, counterclockwise"
if "right_synonyms" not in st.session_state:
    st.session_state.right_synonyms = "right, clockwise"
if "student_dict_notes" not in st.session_state:
    st.session_state.student_dict_notes = ""
if "student_new_commands" not in st.session_state:
    st.session_state.student_new_commands = ""
if "llm_commands_new" not in st.session_state:
    st.session_state.llm_commands_new = ""


# ------------------------------
# STEP 1: Read Mission Log
# ------------------------------
if step == "1️⃣ Read Mission Log":
    st.header("1️⃣ Read the Mission Log")

    st.markdown(
        "Mission Control has sent a **lunar mission log** written in casual astronaut language.\n"
        "Your robot only understands simple commands like `MOVE 2` or `TURN 90`."
    )

    col1, col2 = st.columns([2, 1])
    with col1:
        st.subheader("Mission Log 1 (from Mission Control)")
        st.text_area(
            "Mission Log Text",
            value=SAMPLE_MISSION_LOG,
            height=180,
            key="mission_log_1",
        )

    with col2:
        st.info(
            "🧠 **Goal for this step:**\n"
            "- Read the log carefully\n"
            "- Imagine what the robot should actually do on the floor\n"
            "- Get ready to pull out the most important words"
        )

    st.markdown("---")
    st.markdown(
        "Next, you'll **highlight important words and phrases** that matter to a robot: "
        "_actions_, _amounts_, and _places_."
    )


# ------------------------------
# STEP 2: Extract Key Phrases
# ------------------------------
elif step == "2️⃣ Extract Key Phrases":
    st.header("2️⃣ Extract Key Phrases (Tokenization & Info Extraction)")

    st.markdown(
        "Computers can't understand the whole paragraph at once.\n"
        "We first pull out the **important pieces**:"
    )

    st.markdown("**Mission Log 1:**")
    st.code(st.session_state.get("mission_log_1", SAMPLE_MISSION_LOG))

    col1, col2, col3 = st.columns(3)

    with col1:
        st.subheader("🔧 Action Words")
        st.caption("Verbs like *cruise, advance, pivot*…")
        actions = st.text_area(
            "List action words (comma-separated):",
            value="cruise, forward, pivot",
            height=100,
            key="actions_list",
        )

    with col2:
        st.subheader("🔢 Amounts / Numbers")
        st.caption("How far? How many tiles? Turns like *quarter turn*…")
        amounts = st.text_area(
            "List number/amount words:",
            value="two, tiles, quarter turn",
            height=100,
            key="amounts_list",
        )

    with col3:
        st.subheader("📍 Landmarks")
        st.caption("Places like *first crater, communications tower*…")
        landmarks = st.text_area(
            "List landmark phrases:",
            value="first crater, communications tower",
            height=100,
            key="landmarks_list",
        )

    st.info(
        "➡️ **This is like tokenization + entity extraction.**\n\n"
        "- You're picking out words that matter to the robot\n"
        "- Some words are helpful, others are just fluff\n"
        "- Real NLP systems do this automatically with algorithms"
    )


# ------------------------------
# STEP 3: Translate to Commands
# ------------------------------
elif step == "3️⃣ Translate to Commands":
    st.header("3️⃣ Translate Sentences into Robot Commands")

    st.markdown(
        "Now we'll turn each sentence into simple commands our robot understands."
    )

    mission_text = st.session_state.get("mission_log_1", SAMPLE_MISSION_LOG)
    # naive sentence split
    sentences = [s.strip() for s in mission_text.replace("\n", " ").split(".") if s.strip()]

    st.subheader("Mission Log 1 Sentences")
    for i, s in enumerate(sentences, start=1):
        st.markdown(f"**Sentence {i}:** {s}")

    st.markdown("### Your Command List")
    st.caption(
        "Write each command on its own line, using a simple format like:\n"
        "`MOVE 2` or `TURN 90`"
    )

    st.session_state.student_commands_1 = st.text_area(
        "Your commands for Mission Log 1:",
        value=st.session_state.student_commands_1,
        height=150,
    )

    with st.expander("👀 Teacher / Reference Commands (hidden from students by default)"):
        st.code(REFERENCE_COMMANDS, language="text")

    if st.button("Check how close my path is to the reference"):
        result = compare_paths(
            st.session_state.student_commands_1 or "",
            REFERENCE_COMMANDS,
        )
        distance = result["distance"]

        if distance < 0.5:
            st.success(
                f"Great job! Your end position is very close to the reference (distance ≈ {distance:.2f} tiles)."
            )
        elif distance < 1.5:
            st.info(
                f"Pretty good! You're within about {distance:.2f} tiles of the reference."
            )
        else:
            st.warning(
                f"Your path is off by about {distance:.2f} tiles. Try adjusting your commands."
            )

        col1, col2 = st.columns(2)
        with col1:
            st.markdown("**Your Commands:**")
            st.code("\n".join(result["student_list"]), language="text")
        with col2:
            st.markdown("**Reference Commands:**")
            st.code("\n".join(result["ref_list"]), language="text")


# ------------------------------
# STEP 4: Build Dictionary
# ------------------------------
elif step == "4️⃣ Build Dictionary":
    st.header("4️⃣ Build a Tiny Language → Command Dictionary")

    st.markdown(
        "Real NLP models learn patterns like **'cruise forward' means MOVE** and\n"
        "**'pivot right' means TURN** from lots of examples.\n\n"
        "Here, you'll build a small **rule-based dictionary** yourself."
    )

    st.subheader("Training Phrases (Examples)")
    st.caption("You can show these to students as your 'training data'.")
    training_examples = [
        ("Cruise forward two tiles.", "MOVE 2"),
        ("Advance three steps.", "MOVE 3"),
        ("Rotate left a half turn.", "TURN -180"),
        ("Pivot right a quarter turn.", "TURN 90"),
        ("Back up one tile.", "MOVE -1"),
    ]
    for phrase, cmd in training_examples:
        st.markdown(f"- `{phrase}` → `{cmd}`")

    st.markdown("### Your Dictionary (Synonyms & Notes)")

    col1, col2 = st.columns(2)
    with col1:
        st.text("Words that usually mean MOVE:")
        st.session_state.move_synonyms = st.text_input(
            "MOVE synonyms (comma-separated):",
            value=st.session_state.move_synonyms,
            key="move_synonyms_input",
        )
        st.text("Words that usually mean TURN:")
        st.session_state.turn_synonyms = st.text_input(
            "TURN synonyms (comma-separated):",
            value=st.session_state.turn_synonyms,
            key="turn_synonyms_input",
        )

    with col2:
        st.text("Words that usually mean LEFT:")
        st.session_state.left_synonyms = st.text_input(
            "LEFT synonyms (comma-separated):",
            value=st.session_state.left_synonyms,
            key="left_synonyms_input",
        )
        st.text("Words that usually mean RIGHT:")
        st.session_state.right_synonyms = st.text_input(
            "RIGHT synonyms (comma-separated):",
            value=st.session_state.right_synonyms,
            key="right_synonyms_input",
        )

    st.session_state.student_dict_notes = st.text_area(
        "Notes on your rules (how to handle half/quarter turns, numbers, etc.):",
        value=st.session_state.student_dict_notes,
        height=120,
    )

    st.info(
        "💡 **NLP connection:**\n"
        "- These word lists are like the **parameters** of your model.\n"
        "- Real models learn them from data instead of you typing them in."
    )


# ------------------------------
# STEP 5: Decode New Log
# ------------------------------
elif step == "5️⃣ Decode New Log":
    st.header("5️⃣ Decode a New Mission Log with Your Rules (Test Set)")

    st.markdown(
        "Now we'll see how well your rules **generalize** to a new message."
    )

    st.subheader("New Mission Log (Test)")
    st.code(NEW_MISSION_LOG)

    # Reuse synonyms from session state
    move_words = parse_synonyms(st.session_state.move_synonyms)
    turn_words = parse_synonyms(st.session_state.turn_synonyms)
    left_words = parse_synonyms(st.session_state.left_synonyms)
    right_words = parse_synonyms(st.session_state.right_synonyms)

    st.markdown("### Assist: What might your rules detect here?")

    lower_text = NEW_MISSION_LOG.lower()

    detected = {
        "MOVE words": [w for w in move_words if w in lower_text],
        "TURN words": [w for w in turn_words if w in lower_text],
        "LEFT words": [w for w in left_words if w in lower_text],
        "RIGHT words": [w for w in right_words if w in lower_text],
        "Number words": [w for w in NUMBER_WORDS.keys() if w in lower_text],
    }

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("**Words your rules might pick up:**")
        for label, words in detected.items():
            st.markdown(f"- **{label}**: {', '.join(words) if words else 'None found'}")

    with col2:
        st.info(
            "🧠 Try to decide:\n"
            "- Which sentence is a MOVE?\n"
            "- Which sentence is a TURN?\n"
            "- How many tiles? How many degrees?\n"
            "Use your dictionary as guidance."
        )

    st.markdown("### Your Commands for New Mission Log")
    st.session_state.student_new_commands = st.text_area(
        "Write your commands for the NEW mission log:",
        value=st.session_state.student_new_commands,
        height=150,
    )

    with st.expander("👀 Teacher / Reference Commands for New Log"):
        st.code(NEW_REFERENCE_COMMANDS, language="text")

    if st.button("Check my path vs reference for NEW log"):
        result = compare_paths(
            st.session_state.student_new_commands or "",
            NEW_REFERENCE_COMMANDS,
        )
        distance = result["distance"]
        if distance < 0.5:
            st.success(
                f"Excellent! Your end position is very close to the reference (distance ≈ {distance:.2f} tiles)."
            )
        elif distance < 1.5:
            st.info(
                f"Nice! You're within about {distance:.2f} tiles of the reference."
            )
        else:
            st.warning(
                f"Your path is off by about {distance:.2f} tiles. Re-check your MOVE/TURN and amounts."
            )

        col1, col2 = st.columns(2)
        with col1:
            st.markdown("**Your Commands (NEW log):**")
            st.code("\n".join(result["student_list"]), language="text")
        with col2:
            st.markdown("**Reference Commands (NEW log):**")
            st.code("\n".join(result["ref_list"]), language="text")


# ------------------------------
# STEP 6: Compare with LLM
# ------------------------------
elif step == "6️⃣ Compare with LLM":
    st.header("6️⃣ Compare Your Commands with an LLM")

    st.markdown(
        "Now we compare your decoding of the **NEW mission log** to the output from an\n"
        "**actual language model** (for example, a LLaMA or GPT model)."
    )

    st.subheader("1. Suggested Prompt to Use with an LLM")
    st.caption(
        "Students can copy this whole prompt, paste it into an LLM, and let it generate robot commands.\n"
        "This prompt already includes the NEW mission log."
    )

    prompt_for_llm = f"""You are helping students translate a lunar mission log into simple robot commands for a small classroom robot.

Rules:
- The robot moves on a square-tile floor.
- Valid commands are:
  - MOVE <number_of_tiles>
  - TURN <degrees_clockwise>
- Use one command per line.
- Do NOT include explanations or extra text, only the commands.
- Positive TURN angles mean turning right/clockwise.
- Negative TURN angles mean turning left/counterclockwise.
- If a direction is described qualitatively (e.g., "quarter turn to the right"),
  choose a reasonable degree value (e.g., 90 for a quarter turn, 180 for a half turn).

Now convert the following mission log into commands:

{NEW_MISSION_LOG}
"""
    st.code(prompt_for_llm, language="text")

    st.subheader("2. Your Commands (New Mission Log)")
    st.code(
        st.session_state.student_new_commands or "No commands yet – fill them in step 5.",
        language="text",
    )

    st.subheader("3. LLM Commands")
    st.caption(
        "1. Copy the prompt above into an LLM (e.g., LLaMA, GPT).\n"
        "2. Copy the LLM's response (the commands) and paste it here."
    )

    st.session_state.llm_commands_new = st.text_area(
        "Paste LLM-generated commands for the NEW mission log:",
        value=st.session_state.llm_commands_new,
        height=150,
    )

    # Optional: numerical comparison of paths
    if st.button("Compare all three: You vs LLM vs Reference"):
        student_cmds = st.session_state.student_new_commands or ""
        llm_cmds = st.session_state.llm_commands_new or ""
        ref_cmds = NEW_REFERENCE_COMMANDS

        res_student = compare_paths(student_cmds, ref_cmds)
        res_llm = compare_paths(llm_cmds, ref_cmds) if llm_cmds.strip() else None

        st.markdown("### Path Comparison")

        col1, col2 = st.columns(2)
        with col1:
            st.markdown("**Your vs Reference**")
            st.write(
                f"Distance between end positions: `{res_student['distance']:.2f}` tiles"
            )

        # Still gotta add in key if API call is used
        with col2:
            if res_llm is not None:
                st.markdown("**LLM vs Reference**")
                st.write(
                    f"Distance between end positions: `{res_llm['distance']:.2f}` tiles"
                )
            else:
                st.write("No LLM commands provided yet.")

        st.markdown("### Side-by-Side Commands")
        c1, c2, c3 = st.columns(3)
        with c1:
            st.markdown("**Your Commands**")
            st.code("\n".join(res_student["student_list"]), language="text")
        with c2:
            st.markdown("**LLM Commands**")
            if res_llm is not None:
                st.code("\n".join(res_llm["student_list"]), language="text")
            else:
                st.code("(none)", language="text")
        with c3:
            st.markdown("**Reference Commands**")
            st.code("\n".join(res_student["ref_list"]), language="text")

    st.info(
        "💬 **Discussion prompts for students:**\n"
        "- Where did you and the LLM agree? Where did you differ?\n"
        "- Did the LLM ever misunderstand a phrase?\n"
        "- Were your rules too strict or too loose?\n\n"
        "This shows that both **humans and AI models** can misinterpret language\n"
        "and that clear instructions (prompts) matter."
    )