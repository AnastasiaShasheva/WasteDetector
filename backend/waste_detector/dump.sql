--
-- PostgreSQL database dump
--

\restrict xHTbs5lbOlRaTvdqC3zMtw7hopAUiMQyDrIjVdF7fWPf3Y8PTB9MqdBOdJGuXLX

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: session_privacy; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.session_privacy AS ENUM (
    'public',
    'private'
);


ALTER TYPE public.session_privacy OWNER TO postgres;

--
-- Name: snapshot_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.snapshot_status AS ENUM (
    'pending',
    'cleaned'
);


ALTER TYPE public.snapshot_status OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'user',
    'moderator',
    'admin',
    'banned'
);


ALTER TYPE public.user_role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cleanup_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cleanup_requests (
    id integer NOT NULL,
    session_id integer NOT NULL,
    requester_user_id integer NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    verification_photos text[],
    comment text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cleanup_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.cleanup_requests OWNER TO postgres;

--
-- Name: COLUMN cleanup_requests.status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.cleanup_requests.status IS 'pending, approved, rejected';


--
-- Name: cleanup_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.cleanup_requests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cleanup_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reports (
    id integer NOT NULL,
    session_id integer NOT NULL,
    reporter_user_id integer NOT NULL,
    reason character varying(255) NOT NULL,
    comment text,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_by integer,
    CONSTRAINT reports_reason_check CHECK (((reason)::text = ANY ((ARRAY['spam'::character varying, 'inappropriate'::character varying, 'fake'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT reports_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'resolved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.reports OWNER TO postgres;

--
-- Name: COLUMN reports.reason; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.reports.reason IS 'spam, inappropriate, fake, other';


--
-- Name: COLUMN reports.status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.reports.status IS 'pending, resolved, rejected';


--
-- Name: reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.reports ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title character varying(255) NOT NULL,
    session_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    privacy public.session_privacy DEFAULT 'private'::public.session_privacy,
    cleanup_status character varying(20) DEFAULT 'pending'::character varying,
    CONSTRAINT sessions_cleanup_status_check CHECK (((cleanup_status)::text = ANY ((ARRAY['pending'::character varying, 'cleaned'::character varying])::text[])))
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- Name: COLUMN sessions.session_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.sessions.session_id IS 'Публичный идентификатор сессии';


--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.sessions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.snapshots (
    id integer NOT NULL,
    filename character varying(255) NOT NULL,
    original_image_path text NOT NULL,
    result_image_path text,
    waste_count integer DEFAULT 0 NOT NULL,
    location public.geometry(Point,4326),
    session_id_fk integer NOT NULL
);


ALTER TABLE public.snapshots OWNER TO postgres;

--
-- Name: COLUMN snapshots.result_image_path; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.snapshots.result_image_path IS 'Путь к файлу с разметкой';


--
-- Name: COLUMN snapshots.location; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.snapshots.location IS 'GPS координаты (PostGIS)';


--
-- Name: snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    login character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    pswd character varying(255) NOT NULL,
    role public.user_role DEFAULT 'user'::public.user_role,
    is_active boolean DEFAULT true,
    blocked_reason text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: COLUMN users.pswd; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.users.pswd IS 'Хеш пароля (bcrypt)';


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Data for Name: cleanup_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cleanup_requests (id, session_id, requester_user_id, status, verification_photos, comment, created_at) FROM stdin;
13	61	3	approved	{/media/cleanup_photos/cleanup_68655cf9-8b7c-41f6-9bf3-4244c9772215.jpg}	15 июня мусор был убран	2026-06-12 21:11:52.129792
14	62	3	approved	{/media/cleanup_photos/cleanup_0baa8077-7535-4aa2-b11d-aad4dcdd3a6a.jpg}	Мусор был убран	2026-06-12 21:27:01.273771
15	64	3	approved	{/media/cleanup_photos/cleanup_c4d7a012-6b5f-4234-ba39-80e08bbf292e.jpg}	Мусор был убран	2026-06-12 21:45:07.583018
\.


--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reports (id, session_id, reporter_user_id, reason, comment, status, created_at, resolved_by) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (id, user_id, title, session_id, created_at, privacy, cleanup_status) FROM stdin;
62	5	Сессия от 13.06.2026, 00:26:22	3e45350f-7529-429b-9871-9b2196c46739	2026-06-12 21:26:15.824904	public	cleaned
64	5	Сессия от 13.06.2026, 00:44:30	b43e7c35-7bd8-4aaf-9461-9e35750ec772	2026-06-12 21:44:20.498584	public	cleaned
61	5	Сессия от 13.06.2026, 00:11:03	c51eb62a-d985-4453-a440-ee86fb2de946	2026-06-12 21:10:55.381558	public	cleaned
\.


--
-- Data for Name: snapshots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.snapshots (id, filename, original_image_path, result_image_path, waste_count, location, session_id_fk) FROM stdin;
85	470306ac-06f0-4bf2-8f2b-4066b05c39fa.jpg	/media/uploads/470306ac-06f0-4bf2-8f2b-4066b05c39fa.jpg	/media/results/470306ac-06f0-4bf2-8f2b-4066b05c39fa.jpg	4	0101000020E6100000DCFD66B1766249405ACFD49C5ADD4E40	61
86	ba89cd16-8c61-4f13-8049-d04d4046dd7c.jpg	/media/uploads/ba89cd16-8c61-4f13-8049-d04d4046dd7c.jpg	/media/results/ba89cd16-8c61-4f13-8049-d04d4046dd7c.jpg	4	0101000020E6100000D7C9557B3A614940B3C21A5408DD4E40	61
87	6e99fc13-3efa-4757-823b-c3d60a84ad2c.jpg	/media/uploads/6e99fc13-3efa-4757-823b-c3d60a84ad2c.jpg	/media/results/6e99fc13-3efa-4757-823b-c3d60a84ad2c.jpg	4	0101000020E6100000DCFD66B1766249405ACFD49C5ADD4E40	62
88	951c99e4-128c-47e5-81ec-fb90a37ba948.jpg	/media/uploads/951c99e4-128c-47e5-81ec-fb90a37ba948.jpg	/media/results/951c99e4-128c-47e5-81ec-fb90a37ba948.jpg	4	0101000020E6100000D7C9557B3A614940B3C21A5408DD4E40	62
91	3b78dc3b-5286-41bd-95e0-97d67d48e3e3.jpg	/media/uploads/3b78dc3b-5286-41bd-95e0-97d67d48e3e3.jpg	/media/results/3b78dc3b-5286-41bd-95e0-97d67d48e3e3.jpg	4	0101000020E6100000DCFD66B1766249405ACFD49C5ADD4E40	64
92	97cc607e-917c-4dc8-a45a-944c6dc9cf16.jpg	/media/uploads/97cc607e-917c-4dc8-a45a-944c6dc9cf16.jpg	/media/results/97cc607e-917c-4dc8-a45a-944c6dc9cf16.jpg	4	0101000020E6100000D7C9557B3A614940B3C21A5408DD4E40	64
\.


--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, login, email, pswd, role, is_active, blocked_reason) FROM stdin;
2	user1	useruser@gmail.com	$2b$12$nWHnhad/rGnZMth8EtJcUORjLhtDqFaGCxzeuszY6nVvxOy08B65u	moderator	t	\N
1	unifor	ynifor.arts@gmail.com	$2b$12$oIvaedjpMwyvYbBrTom//uIGmwwFE/t8aha7LGUVU7PJstosmhbtO	admin	t	\N
4	lolbit	lolbitlolbit@lolbit.com	$2b$12$tH7OsjR6ZAbsutWjvximxOj9ccPDZrSqcN2LngXuuh7LKlpTfeXNy	user	t	\N
3	user2	user2user@gmail.com	$2b$12$95HUcHOekh70oihZcY1.Ou43/yg.MlhATHzuoCJv8T8pucRFJsPEe	user	t	\N
5	user	useruseruser@gmail.com	$2b$12$o6eFmlurDwRWHOnzINd.D.NbtOvH9vU/dqkjnZUAUlkfO5nOdBtDi	user	t	\N
\.


--
-- Name: cleanup_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cleanup_requests_id_seq', 15, true);


--
-- Name: reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reports_id_seq', 9, true);


--
-- Name: sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.sessions_id_seq', 64, true);


--
-- Name: snapshots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.snapshots_id_seq', 92, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 5, true);


--
-- Name: cleanup_requests cleanup_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cleanup_requests
    ADD CONSTRAINT cleanup_requests_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: snapshots snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.snapshots
    ADD CONSTRAINT snapshots_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_login_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_login_key UNIQUE (login);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_cleanup_requests_requester_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cleanup_requests_requester_user_id ON public.cleanup_requests USING btree (requester_user_id);


--
-- Name: idx_cleanup_requests_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cleanup_requests_session_id ON public.cleanup_requests USING btree (session_id);


--
-- Name: idx_reports_reporter_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_reporter_user_id ON public.reports USING btree (reporter_user_id);


--
-- Name: idx_reports_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_session_id ON public.reports USING btree (session_id);


--
-- Name: idx_sessions_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_session_id ON public.sessions USING btree (session_id);


--
-- Name: idx_snapshots_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_snapshots_location ON public.snapshots USING gist (location);


--
-- Name: idx_snapshots_session_id_fk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_snapshots_session_id_fk ON public.snapshots USING btree (session_id_fk);


--
-- Name: idx_users_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_is_active ON public.users USING btree (is_active);


--
-- Name: cleanup_requests fk_cleanup_requests_requester_user_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cleanup_requests
    ADD CONSTRAINT fk_cleanup_requests_requester_user_id FOREIGN KEY (requester_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cleanup_requests fk_cleanup_requests_session_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cleanup_requests
    ADD CONSTRAINT fk_cleanup_requests_session_id FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: reports fk_reports_reporter_user_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_reporter_user_id FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reports fk_reports_resolved_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_resolved_by FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reports fk_reports_session_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_session_id FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: sessions fk_sessions_user_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT fk_sessions_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: snapshots fk_snapshots_session_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.snapshots
    ADD CONSTRAINT fk_snapshots_session_id_fk FOREIGN KEY (session_id_fk) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict xHTbs5lbOlRaTvdqC3zMtw7hopAUiMQyDrIjVdF7fWPf3Y8PTB9MqdBOdJGuXLX

