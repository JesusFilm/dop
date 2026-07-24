export default function Home() {
  // Deliberately minimal — this is the Railway scaffold (issue #26, build-plan
  // step 1). No product behaviour yet; the submit / return / setup screens land
  // in later tickets.
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Day of Prayer</h1>
      <p style={{ color: "#555", margin: 0 }}>
        Scaffold is live. Health at{" "}
        <a href="/api/health">/api/health</a>.
      </p>
    </main>
  );
}
