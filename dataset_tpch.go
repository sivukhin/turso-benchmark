package main

import (
	"io"
	"net/http"
	"os"
)

var queriesTpch = []Query{
	{
		Name: "1.sql",
		Query: `select
        l_returnflag,
        l_linestatus,
        sum(l_quantity) as sum_qty,
        sum(l_extendedprice) as sum_base_price,
        sum(l_extendedprice * (1 - l_discount)) as sum_disc_price,
        sum(l_extendedprice * (1 - l_discount) * (1 + l_tax)) as sum_charge,
        avg(l_quantity) as avg_qty,
        avg(l_extendedprice) as avg_price,
        avg(l_discount) as avg_disc,
        count(*) as count_order
from
        lineitem
where
        l_shipdate <= '1998-12-01' -- modified not to include cast({'day': 71} as interval)
group by
        l_returnflag,
        l_linestatus
order by
        l_returnflag,
        l_linestatus;
`,
		MatchOnlyCount: true, // Ignoring output difference for query 1 (known floating point precision incompatibility)
	},
	// 	{
	// 		Name: "2.sql",
	// 		SQL: `-- LIMBO_SKIP: subquery in where not supported

	// select
	//         s_acctbal,
	//         s_name,
	//         n_name,
	//         p_partkey,
	//         p_mfgr,
	//         s_address,
	//         s_phone,
	//         s_comment
	// from
	//         part,
	//         supplier,
	//         partsupp,
	//         nation,
	//         region
	// where
	//         p_partkey = ps_partkey
	//         and s_suppkey = ps_suppkey
	//         and p_size = 38
	//         and p_type like '%TIN'
	//         and s_nationkey = n_nationkey
	//         and n_regionkey = r_regionkey
	//         and r_name = 'MIDDLE EAST'
	//         and ps_supplycost = (
	//                 select
	//                         min(ps_supplycost)
	//                 from
	//                         partsupp,
	//                         supplier,
	//                         nation,
	//                         region
	//                 where
	//                         p_partkey = ps_partkey
	//                         and s_suppkey = ps_suppkey
	//                         and s_nationkey = n_nationkey
	//                         and n_regionkey = r_regionkey
	//                         and r_name = 'MIDDLE EAST'
	//         )
	// order by
	//         s_acctbal desc,
	//         n_name,
	//         s_name,
	//         p_partkey
	// limit 100;
	// `},
	{
		Name: "3.sql",
		Query: `select
        l_orderkey,
        sum(l_extendedprice * (1 - l_discount)) as revenue,
        o_orderdate,
        o_shippriority
from
        customer,
        orders,
        lineitem
where
        c_mktsegment = 'FURNITURE'
        and c_custkey = o_custkey
        and l_orderkey = o_orderkey
        and o_orderdate < '1995-03-29'
        and l_shipdate > '1995-03-29'
group by
        l_orderkey,
        o_orderdate,
        o_shippriority
order by
        revenue desc,
        o_orderdate
limit 10;
`,
		MatchOnlyCount: true},
	// 	{
	// 		Name: "4.sql",
	// 		SQL: `-- LIMBO_SKIP: subquery in where not supported

	// select
	//         o_orderpriority,
	//         count(*) as order_count
	// from
	//         orders
	// where
	//         o_orderdate >= '1997-06-01'
	//         and o_orderdate < '1997-09-01' -- modified not to include cast({'month': 3} as interval)
	//         and exists (
	//                 select
	//                         *
	//                 from
	//                         lineitem
	//                 where
	//                         l_orderkey = o_orderkey
	//                         and l_commitdate < l_receiptdate
	//         )
	// group by
	//         o_orderpriority
	// order by
	//         o_orderpriority;
	// `},
	{
		Name: "5.sql",
		Query: `select
        n_name,
        sum(l_extendedprice * (1 - l_discount)) as revenue
from
        customer,
        orders,
        lineitem,
        supplier,
        nation,
        region
where
        c_custkey = o_custkey
        and l_orderkey = o_orderkey
        and l_suppkey = s_suppkey
        and c_nationkey = s_nationkey
        and s_nationkey = n_nationkey
        and n_regionkey = r_regionkey
        and r_name = 'MIDDLE EAST'
        and o_orderdate >= '1994-01-01'
        and o_orderdate < '1995-01-01' -- modified not to include cast({'year': 1} as interval)
group by
        n_name
order by
        revenue desc;
`,
		MatchOnlyCount: true},
	{
		Name: "6.sql",
		Query: `select
        sum(l_extendedprice * l_discount) as revenue
from
        lineitem
where
        l_shipdate >= '1994-01-01'
        and l_shipdate < '1995-01-01' -- modified not to include cast({'year': 1} as interval)
        and l_discount between 0.08 - 0.01 and 0.08 + 0.01
        and l_quantity < 24;
`,
		MatchOnlyCount: true},
	{
		Name: "7.sql",
		Query: `select
        supp_nation,
        cust_nation,
        l_year,
        sum(volume) as revenue
from
        (
                select
                        n1.n_name as supp_nation,
                        n2.n_name as cust_nation,
                        substr(l_shipdate, 1, 4) as l_year, -- modified not to include date_part('year', l_shipdate)
                        l_extendedprice * (1 - l_discount) as volume
                from
                        supplier,
                        lineitem,
                        orders,
                        customer,
                        nation n1,
                        nation n2
                where
                        s_suppkey = l_suppkey
                        and o_orderkey = l_orderkey
                        and c_custkey = o_custkey
                        and s_nationkey = n1.n_nationkey
                        and c_nationkey = n2.n_nationkey
                        and (
                                (n1.n_name = 'ROMANIA' and n2.n_name = 'INDIA')
                                or (n1.n_name = 'INDIA' and n2.n_name = 'ROMANIA')
                        )
                        and l_shipdate between
                        '1995-01-01' and '1996-12-31'
        ) as shipping
group by
        supp_nation,
        cust_nation,
        l_year
order by
        supp_nation,
        cust_nation,
        l_year;
`,
		MatchOnlyCount: true},
	{
		Name: "8.sql",
		Query: `select
        o_year,
        sum(cast(case
                when nation = 'INDIA' then volume
                else 0
        end as number)) / sum(volume) as mkt_share
from
        (
                select
                        substr(o_orderdate, 1, 4) as o_year, -- modified not to include date_part('year', o_orderdate)
                        l_extendedprice * (1 - l_discount) as volume,
                        n2.n_name as nation
                from
                        part,
                        supplier,
                        lineitem,
                        orders,
                        customer,
                        nation n1,
                        nation n2,
                        region
                where
                        p_partkey = l_partkey
                        and s_suppkey = l_suppkey
                        and l_orderkey = o_orderkey
                        and o_custkey = c_custkey
                        and c_nationkey = n1.n_nationkey
                        and n1.n_regionkey = r_regionkey
                        and r_name = 'ASIA'
                        and s_nationkey = n2.n_nationkey
                        and o_orderdate between
                                '1995-01-01' and '1996-12-31'
                        and p_type = 'PROMO BRUSHED COPPER'
        ) as all_nations
group by
        o_year
order by
        o_year;
`,
		MatchOnlyCount: true},
	{
		Name: "9.sql",
		Query: `select
        nation,
        o_year,
        sum(amount) as sum_profit
from
        (
                select
                        n_name as nation,
                        substr(o_orderdate, 1, 4) as o_year, -- modified not to include date_part('year', o_orderdate)
                        l_extendedprice * (1 - l_discount) - ps_supplycost * l_quantity as amount
                from
                        part,
                        supplier,
                        lineitem,
                        partsupp,
                        orders,
                        nation
                where
                        s_suppkey = l_suppkey
                        and ps_suppkey = l_suppkey
                        and ps_partkey = l_partkey
                        and p_partkey = l_partkey
                        and o_orderkey = l_orderkey
                        and s_nationkey = n_nationkey
                        and p_name like '%yellow%'
        ) as profit
group by
        nation,
        o_year
order by
        nation,
        o_year desc;
`,
		MatchOnlyCount: true},
	{
		Name: "10.sql",
		Query: `select
        c_custkey,
        c_name,
        sum(l_extendedprice * (1 - l_discount)) as revenue,
        c_acctbal,
        n_name,
        c_address,
        c_phone,
        c_comment
from
        customer,
        orders,
        lineitem,
        nation
where
        c_custkey = o_custkey
        and l_orderkey = o_orderkey
        and o_orderdate >= '1994-01-01'
        and o_orderdate < '1994-04-01' -- modified not to include cast({'month': 3} as interval)
        and l_returnflag = 'R'
        and c_nationkey = n_nationkey
group by
        c_custkey,
        c_name,
        c_acctbal,
        c_phone,
        n_name,
        c_address,
        c_comment
order by
        revenue desc
limit 20;
`,
		MatchOnlyCount: true},
	// 	{
	// 		Name: "11.sql",
	// 		SQL: `-- LIMBO_SKIP: subquery in where not supported

	// select
	//         ps_partkey,
	//         sum(ps_supplycost * ps_availqty) as value
	// from
	//         partsupp,
	//         supplier,
	//         nation
	// where
	//         ps_suppkey = s_suppkey
	//         and s_nationkey = n_nationkey
	//         and n_name = 'ARGENTINA'
	// group by
	//         ps_partkey having
	//                 sum(ps_supplycost * ps_availqty) > (
	//                         select
	//                                 sum(ps_supplycost * ps_availqty) * 0.0001000000
	//                         from
	//                                 partsupp,
	//                                 supplier,
	//                                 nation
	//                         where
	//                                 ps_suppkey = s_suppkey
	//                                 and s_nationkey = n_nationkey
	//                                 and n_name = 'ARGENTINA'
	//                 )
	// order by
	//         value desc;
	// `},
	{
		Name: "12.sql",
		Query: `select
        l_shipmode,
        sum(case
                when o_orderpriority = '1-URGENT'
                        or o_orderpriority = '2-HIGH'
                        then 1
                else 0
        end) as high_line_count,
        sum(case
                when o_orderpriority <> '1-URGENT'
                        and o_orderpriority <> '2-HIGH'
                        then 1
                else 0
        end) as low_line_count
from
        orders,
        lineitem
where
        o_orderkey = l_orderkey
        and l_shipmode in ('FOB', 'SHIP')
        and l_commitdate < l_receiptdate
        and l_shipdate < l_commitdate
        and l_receiptdate >= '1994-01-01'
        and l_receiptdate < '1995-01-01' -- modified not to include cast({'year': 1} as interval)
group by
        l_shipmode
order by
        l_shipmode;
`,
		MatchOnlyCount: true},
	{
		Name: "13.sql",
		Query: `select
        c_count,
        count(*) as custdist
from
        (
                select
                        c_custkey,
                        count(o_orderkey) as c_count
                from
                        customer left outer join orders on
                                c_custkey = o_custkey
                                and o_comment not like '%express%packages%'
                group by
                        c_custkey
        ) as c_orders
group by
        c_count
order by
        custdist desc,
        c_count desc;
`,
		MatchOnlyCount: true},
	{
		Name: "14.sql",
		Query: `select
        100.00 * sum(cast(case
                when p_type like 'PROMO%'
                        then l_extendedprice * (1 - l_discount)
                else 0
        end as number)) / sum(l_extendedprice * (1 - l_discount)) as promo_revenue
from
        lineitem,
        part
where
        l_partkey = p_partkey
        and l_shipdate >= '1994-03-01'
        and l_shipdate < '1994-04-01'; -- modified not to include cast({'month': 1} as interval)
`,
		MatchOnlyCount: true},
	// 	{
	// 		Name: "15.sql",
	// 		SQL: `-- LIMBO_SKIP: views not supported

	// create view revenue0 (supplier_no, total_revenue) as
	//         select
	//                 l_suppkey,
	//                 sum(l_extendedprice * (1 - l_discount))
	//         from
	//                 lineitem
	//         where
	//                 l_shipdate >= '1993-01-01'
	//                 and l_shipdate < '1993-04-01' -- modified not to include cast({'month': 3} as interval)
	//         group by
	//                 l_suppkey;

	// select
	//         s_suppkey,
	//         s_name,
	//         s_address,
	//         s_phone,
	//         total_revenue
	// from
	//         supplier,
	//         revenue0
	// where
	//         s_suppkey = supplier_no
	//         and total_revenue = (
	//                 select
	//                         max(total_revenue)
	//                 from
	//                         revenue0
	//         )
	// order by
	//         s_suppkey;

	// drop view revenue0;
	// `},
	// 	{
	// 		Name: "16.sql",
	// 		SQL: `-- LIMBO_SKIP: subquery in where not supported

	// select
	//         p_brand,
	//         p_type,
	//         p_size,
	//         count(distinct ps_suppkey) as supplier_cnt
	// from
	//         partsupp,
	//         part
	// where
	//         p_partkey = ps_partkey
	//         and p_brand <> 'Brand#45'
	//         and p_type not like 'SMALL PLATED%'
	//         and p_size in (19, 17, 16, 23, 10, 4, 38, 11)
	//         and ps_suppkey not in (
	//                 select
	//                         s_suppkey
	//                 from
	//                         supplier
	//                 where
	//                         s_comment like '%Customer%Complaints%'
	//         )
	// group by
	//         p_brand,
	//         p_type,
	//         p_size
	// order by
	//         supplier_cnt desc,
	//         p_brand,
	//         p_type,
	//         p_size;
	// `},
	// 	{
	// 		Name: "17.sql",
	// 		SQL: `-- LIMBO_SKIP: subquery in where not supported

	// select
	//         sum(l_extendedprice) / 7.0 as avg_yearly
	// from
	//         lineitem,
	//         part
	// where
	//         p_partkey = l_partkey
	//         and p_brand = 'Brand#52'
	//         and p_container = 'LG CAN'
	//         and l_quantity < (
	//                 select
	//                         0.2 * avg(l_quantity)
	//                 from
	//                         lineitem
	//                 where
	//                         l_partkey = p_partkey
	//         );
	// `},
	// 	{
	// 		Name: "18.sql",
	// 		SQL: `-- LIMBO_SKIP: subquery in where not supported

	// select
	//         c_name,
	//         c_custkey,
	//         o_orderkey,
	//         o_orderdate,
	//         o_totalprice,
	//         sum(l_quantity)
	// from
	//         customer,
	//         orders,
	//         lineitem
	// where
	//         o_orderkey in (
	//                 select
	//                         l_orderkey
	//                 from
	//                         lineitem
	//                 group by
	//                         l_orderkey having
	//                                 sum(l_quantity) > 313
	//         )
	//         and c_custkey = o_custkey
	//         and o_orderkey = l_orderkey
	// group by
	//         c_name,
	//         c_custkey,
	//         o_orderkey,
	//         o_orderdate,
	//         o_totalprice
	// order by
	//         o_totalprice desc,
	//         o_orderdate
	// limit 100;
	// `},
	{
		Name: "19.sql",
		Query: `select
        sum(l_extendedprice* (1 - l_discount)) as revenue
from
        lineitem,
        part
where
        (
                p_partkey = l_partkey
                and p_brand = 'Brand#22'
                and p_container in ('SM CASE', 'SM BOX', 'SM PACK', 'SM PKG')
                and l_quantity >= 8 and l_quantity <= 8 + 10
                and p_size between 1 and 5
                and l_shipmode in ('AIR', 'AIR REG')
                and l_shipinstruct = 'DELIVER IN PERSON'
        )
        or
        (
                p_partkey = l_partkey
                and p_brand = 'Brand#23'
                and p_container in ('MED BAG', 'MED BOX', 'MED PKG', 'MED PACK')
                and l_quantity >= 10 and l_quantity <= 10 + 10
                and p_size between 1 and 10
                and l_shipmode in ('AIR', 'AIR REG')
                and l_shipinstruct = 'DELIVER IN PERSON'
        )
        or
        (
                p_partkey = l_partkey
                and p_brand = 'Brand#12'
                and p_container in ('LG CASE', 'LG BOX', 'LG PACK', 'LG PKG')
                and l_quantity >= 24 and l_quantity <= 24 + 10
                and p_size between 1 and 15
                and l_shipmode in ('AIR', 'AIR REG')
                and l_shipinstruct = 'DELIVER IN PERSON'
        );
`,
		MatchOnlyCount: true},
	// 	{
	// 		Name: "20.sql",
	// 		SQL: `-- LIMBO_SKIP: subquery in where not supported

	// select
	//         s_name,
	//         s_address
	// from
	//         supplier,
	//         nation
	// where
	//         s_suppkey in (
	//                 select
	//                         ps_suppkey
	//                 from
	//                         partsupp
	//                 where
	//                         ps_partkey in (
	//                                 select
	//                                         p_partkey
	//                                 from
	//                                         part
	//                                 where
	//                                         p_name like 'frosted%'
	//                         )
	//                         and ps_availqty > (
	//                                 select
	//                                         0.5 * sum(l_quantity)
	//                                 from
	//                                         lineitem
	//                                 where
	//                                         l_partkey = ps_partkey
	//                                         and l_suppkey = ps_suppkey
	//                                         and l_shipdate >= '1994-01-01'
	//                                         and l_shipdate < '1995-01-01' -- modified not to include cast({'year': 1} as interval)
	//                         )
	//         )
	//         and s_nationkey = n_nationkey
	//         and n_name = 'IRAN'
	// order by
	//         s_name;
	// `},
	// 	{
	// 		Name: "21.sql",
	// 		SQL: `-- LIMBO_SKIP: subquery in where not supported

	// select
	//         s_name,
	//         count(*) as numwait
	// from
	//         supplier,
	//         lineitem l1,
	//         orders,
	//         nation
	// where
	//         s_suppkey = l1.l_suppkey
	//         and o_orderkey = l1.l_orderkey
	//         and o_orderstatus = 'F'
	//         and l1.l_receiptdate > l1.l_commitdate
	//         and exists (
	//                 select
	//                         *
	//                 from
	//                         lineitem l2
	//                 where
	//                         l2.l_orderkey = l1.l_orderkey
	//                         and l2.l_suppkey <> l1.l_suppkey
	//         )
	//         and not exists (
	//                 select
	//                         *
	//                 from
	//                         lineitem l3
	//                 where
	//                         l3.l_orderkey = l1.l_orderkey
	//                         and l3.l_suppkey <> l1.l_suppkey
	//                         and l3.l_receiptdate > l3.l_commitdate
	//         )
	//         and s_nationkey = n_nationkey
	//         and n_name = 'GERMANY'
	// group by
	//         s_name
	// order by
	//         numwait desc,
	//         s_name
	// limit 100;
	// `},
	// 	{
	// 		Name: "22.sql",
	// 		SQL: `-- LIMBO_SKIP: subquery in where not supported

	// select
	//
	//	cntrycode,
	//	count(*) as numcust,
	//	sum(c_acctbal) as totacctbal
	//
	// from
	//
	//	(
	//	        select
	//	                substr(c_phone, 1, 2) as cntrycode,
	//	                c_acctbal
	//	        from
	//	                customer
	//	        where
	//	                substr(c_phone, 1, 2) in
	//	                        ('20', '14', '21', '28', '15', '24', '27')
	//	                and c_acctbal > (
	//	                        select
	//	                                avg(c_acctbal)
	//	                        from
	//	                                customer
	//	                        where
	//	                                c_acctbal > 0.00
	//	                                and substr(c_phone, 1, 2) in
	//	                                        ('20', '14', '21', '28', '15', '24', '27')
	//	                )
	//	                and not exists (
	//	                        select
	//	                                *
	//	                        from
	//	                                orders
	//	                        where
	//	                                o_custkey = c_custkey
	//	                )
	//	) as custsale
	//
	// group by
	//
	//	cntrycode
	//
	// order by
	//
	//	cntrycode;
	//
	// `},
}

type DatasetTpch struct{}

func (d *DatasetTpch) Name() string { return "tpc-h" }
func (d *DatasetTpch) Load(path string) ([]Query, error) {
	if _, err := os.Stat(path); err == nil {
		Logger.Infof("dataset %v already exists, skip initialization", d.Name())
		return queriesTpch, nil
	}
	url := "https://github.com/lovasoa/TPCH-sqlite/releases/download/v1.0/TPC-H.db"
	response, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	file, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	_, err = io.Copy(file, response.Body)
	if err != nil {
		return nil, err
	}
	return queriesTpch, nil
}
